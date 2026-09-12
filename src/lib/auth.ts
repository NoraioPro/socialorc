import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth/next";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import FacebookProvider from "next-auth/providers/facebook";
import { facebookCredentials, googleCredentials } from "@/lib/auth-providers";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import prisma from "./prisma";
import {
  DEFAULT_ROLE,
  can,
  isRole,
  parseRole,
  permissionsFor,
  type Permission,
  type Role,
} from "./roles";
import {
  demoEmailFor,
  demoNameFor,
  devRoleFromCredential,
  isDevRoleLoginEnabled,
} from "./dev-login";

/** Read a stored role, defaulting legacy/corrupt values to the safe role. */
async function roleForUser(userId: string): Promise<Role> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  return row?.role && isRole(row.role) ? row.role : parseRole(row?.role);
}

/**
 * Dev-only: resolve the demo account for a role, creating it on first use.
 * The account gets an unusable random password so it can only be reached
 * through role login while the dev flag is on.
 */
async function resolveDemoUser(role: Role) {
  const email = demoEmailFor(role);
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;

  const unusable = await bcrypt.hash(randomUUID(), 12);
  return prisma.user.create({
    data: {
      email,
      name: demoNameFor(role),
      password: unusable,
      role,
      timezone: "Europe/Oslo",
    },
  });
}

// OAuth sign-in is offered only when its credentials exist: an unconfigured
// deployment must not advertise a provider it cannot serve. Facebook reads the
// same Meta app credentials as the connector, so one registration serves both
// sign-in and publishing.
const google = googleCredentials();
const facebook = facebookCredentials();

/**
 * Role for an account created by an OAuth sign-in.
 *
 * The schema default is `ADMIN` (set when roles were introduced, when every
 * existing row was a workspace owner). Inheriting that for self-serve Google
 * sign-ups would make anyone with a Google account an admin of the workspace
 * they land in, so OAuth sign-ups get the least-privileged role that can still
 * use the product. Override deliberately with OAUTH_SIGNUP_ROLE.
 */
const OAUTH_SIGNUP_ROLE: Role = (() => {
  const configured = process.env.OAUTH_SIGNUP_ROLE;
  return configured && isRole(configured) ? configured : ("EDITOR" as Role);
})();

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as NextAuthOptions["adapter"],
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  events: {
    /**
     * A first-time Google sign-in creates the User row through the Prisma
     * adapter, which applies the *schema* default (`ADMIN`). Nobody should become
     * an admin by clicking "Continue with Google", so the row is immediately
     * corrected to OAUTH_SIGNUP_ROLE and can be promoted deliberately after.
     */
    async createUser({ user }) {
      if (!user?.id) return;
      try {
        await prisma.user.update({
          where: { id: user.id },
          data: { role: OAUTH_SIGNUP_ROLE },
        });
      } catch (error) {
        // A missing role update must not break sign-in; log and continue.
        console.error("[auth] could not set signup role for new OAuth user", error);
      }
    },
  },
  providers: [
    ...(google
      ? [
          GoogleProvider({
            clientId: google.clientId,
            clientSecret: google.clientSecret,
            // Never merge a Google login into an existing password account
            // automatically: that is how an attacker with a matching email takes
            // over an account they do not own.
            allowDangerousEmailAccountLinking: false,
          }),
        ]
      : []),
    ...(facebook
      ? [
          FacebookProvider({
            clientId: facebook.clientId,
            clientSecret: facebook.clientSecret,
            allowDangerousEmailAccountLinking: false,
            // next-auth 4 pins the consent dialog to Graph API v11.0, which Meta
            // has since removed, so the default URL fails before a user can even
            // approve. v24.0 is supported until Feb 2028 -- bump this before then
            // (see the "Versions" table in Meta's Graph API changelog).
            authorization: {
              url: "https://www.facebook.com/v24.0/dialog/oauth",
              params: { scope: "email" },
            },
          }),
        ]
      : []),
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        // Only honoured while ALLOW_DEV_ROLE_LOGIN is on (see src/lib/dev-login.ts).
        devRole: { label: "Dev role", type: "text" },
      },
      async authorize(credentials) {
        const devRole = devRoleFromCredential(credentials?.devRole);

        if (devRole !== null) {
          if (!isDevRoleLoginEnabled()) {
            return null;
          }

          const user = await resolveDemoUser(devRole);

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            image: user.image,
            role: devRole,
          };
        }

        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        // Registration lower-cases the address; normalise here too so a user
        // typing "Hassan@Socialorc.local" still finds their account.
        const email = credentials.email.trim().toLowerCase();

        const user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user || !user.password) {
          return null;
        }

        const isPasswordValid = await bcrypt.compare(
          credentials.password,
          user.password
        );

        if (!isPasswordValid) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          role: isRole(user.role) ? user.role : parseRole(user.role),
        };
      },
    }),
  ],
  callbacks: {
    /**
     * Link a Google sign-in to an account that already exists with the same
     * address.
     *
     * NextAuth refuses that by default (`OAuthAccountNotLinked`) and its opt-out,
     * `allowDangerousEmailAccountLinking`, is all-or-nothing: it would also merge
     * identities for a provider that hands back an address it never verified.
     * This callback runs *before* NextAuth's collision check, so we can link the
     * account ourselves and require the provider's own proof that the user owns
     * the address before doing it -- which is what makes merging safe here.
     *
     * Facebook is deliberately excluded: its Graph API returns an address with no
     * `email_verified` claim, so there is nothing to check it against.
     */
    async signIn({ profile, account }) {
      if (account?.provider !== "google" || !account.providerAccountId) {
        return true;
      }

      const claims = profile as
        | { email?: unknown; email_verified?: unknown }
        | undefined;
      const email =
        typeof claims?.email === "string"
          ? claims.email.trim().toLowerCase()
          : null;

      // No address, or Google is not vouching for it: leave it to NextAuth.
      if (!email || claims?.email_verified !== true) {
        return true;
      }

      const [existing, alreadyLinked] = await Promise.all([
        prisma.user.findUnique({ where: { email }, select: { id: true } }),
        prisma.account.findFirst({
          where: {
            provider: account.provider,
            providerAccountId: account.providerAccountId,
          },
          select: { id: true },
        }),
      ]);

      // Nothing to reconcile: no such account to attach to, or this Google
      // identity is already linked (NextAuth matches it and skips the check).
      if (!existing || alreadyLinked) {
        return true;
      }

      await prisma.account.create({
        data: {
          userId: existing.id,
          type: account.type,
          provider: account.provider,
          providerAccountId: account.providerAccountId,
          refresh_token: account.refresh_token ?? null,
          access_token: account.access_token ?? null,
          expires_at: account.expires_at ?? null,
          token_type: account.token_type ?? null,
          scope: account.scope ?? null,
          id_token: account.id_token ?? null,
          session_state: (account.session_state as string | null) ?? null,
        },
      });

      return true;
    },
    async session({ session, token }) {
      if (token && session.user) {
        const role: Role = isRole(token.role) ? token.role : DEFAULT_ROLE;
        session.user.id = token.sub as string;
        session.user.role = role;
        session.user.permissions = permissionsFor(role);
      }
      return session;
    },
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.role = isRole(user.role) ? user.role : await roleForUser(user.id);
      } else if (token.sub && !isRole(token.role)) {
        // Sessions minted before roles existed: resolve once, then carry it.
        token.role = await roleForUser(token.sub);
      }
      return token;
    },
  },
};

export async function getAuthSession() {
  return await getServerSession<typeof authOptions>(authOptions);
}

export async function getCurrentUser() {
  const session = await getAuthSession();
  if (!session?.user?.id) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      socialAccounts: true,
    },
  });

  if (!user) return null;

  return { ...user, role: isRole(user.role) ? user.role : parseRole(user.role) };
}

/**
 * Session guard for API routes: returns the session or null. Route handlers
 * stay responsible for their own status codes (401 vs 403).
 */
export async function requirePermission(permission: Permission): Promise<
  | { ok: true; userId: string; role: Role }
  | { ok: false; status: 401 | 403; error: string }
> {
  const session = await getAuthSession();

  if (!session?.user?.id) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const role: Role = isRole(session.user.role)
    ? session.user.role
    : parseRole(session.user.role);

  if (!can(role, permission)) {
    return {
      ok: false,
      status: 403,
      error: `Your role (${role}) is not allowed to ${permission}`,
    };
  }

  return { ok: true, userId: session.user.id, role };
}
