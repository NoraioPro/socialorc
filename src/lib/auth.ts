import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth/next";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import FacebookProvider from "next-auth/providers/facebook";
import { facebookCredentials, googleCredentials } from "@/lib/auth-providers";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { consumeRateLimit, peekRateLimit } from "@/lib/rate-limit-store";
import { createWorkspaceForNewUser } from "./tenancy/workspace";
import { isSoleWorkspaceMember } from "./tenancy/solo";
import { mayLinkOAuthToExisting, oauthSignInDecision } from "./signup-policy";
import {
  DEFAULT_ROLE,
  can,
  effectiveRole,
  isRole,
  parseRole,
  permissionsFor,
  type Permission,
  type Role,
} from "./roles";

/** Read a stored role, defaulting legacy/corrupt values to the safe role. */
async function roleForUser(userId: string): Promise<Role> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  return effectiveRole(row?.role, await isSoleWorkspaceMember(userId));
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
 * The schema default is `ADMIN` and is never relied on: this value is applied
 * explicitly (createUser event and the jwt callback). It is ADMIN for the same
 * reason as selfSignupRole (src/lib/roles.ts): an OAuth sign-up owns a private
 * workspace of its own, ADMIN's powers are scoped to that workspace, and a lower
 * role could not connect an account or schedule a post. Whether a stranger may
 * sign up at all is decided separately by the signup policy (signIn callback).
 * Override deliberately with OAUTH_SIGNUP_ROLE.
 */
const OAUTH_SIGNUP_ROLE: Role = (() => {
  const configured = process.env.OAUTH_SIGNUP_ROLE;
  return configured && isRole(configured) ? configured : ("ADMIN" as Role);
})();

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as NextAuthOptions["adapter"],
  session: {
    strategy: "jwt",
    // Tokens are not revocable, so keep the window short (the default is 30
    // days). Roles and membership are re-read from the database per request.
    maxAge: 7 * 24 * 60 * 60,
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

      // An OAuth sign-up gets its own workspace here, exactly like a password
      // registration, so both entry points agree. The adapter has already
      // written the user, so this cannot share its transaction; if it fails,
      // the jwt callback below retries on this same sign-in and refuses the
      // sign-in if the account still has no workspace.
      try {
        await createWorkspaceForNewUser({
          userId: user.id,
          name: user.name,
          email: user.email,
        });
      } catch (error) {
        console.error("[auth] could not create the workspace for a new OAuth user", error);
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
      },
      async authorize(credentials) {
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

        // Throttle by the address being attacked rather than by IP: a spray across
        // many accounts is the case here, and the address is the part the attacker
        // picks. The refusal below is the same "nothing" as a wrong password — it
        // says nothing about which of the two it was.
        const budget = await peekRateLimit("login", `email:${email}`);
        if (!budget.allowed) {
          console.warn(`[auth] refused sign-in for ${email}: too many attempts`);
          return null;
        }

        const isPasswordValid = await bcrypt.compare(
          credentials.password,
          user.password
        );

        if (!isPasswordValid) {
          // Spend the budget only on failure, so an attacker cannot lock the real
          // owner out by exhausting it.
          await consumeRateLimit("login", `email:${email}`);
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
    async signIn({ user, profile, account }) {
      // Password sign-ins were authenticated by authorize() above.
      if (!account || account.provider === "credentials") return true;

      const claims = profile as
        | { email?: unknown; email_verified?: unknown }
        | undefined;
      const rawEmail =
        typeof claims?.email === "string"
          ? claims.email
          : typeof user?.email === "string"
            ? user.email
            : null;
      const email = rawEmail ? rawEmail.trim().toLowerCase() : null;

      const [existing, alreadyLinked, userCount] = await Promise.all([
        email
          ? prisma.user.findUnique({
              where: { email },
              select: { id: true, password: true, emailVerified: true },
            })
          : Promise.resolve(null),
        account.providerAccountId
          ? prisma.account.findFirst({
              where: {
                provider: account.provider,
                providerAccountId: account.providerAccountId,
              },
              select: { id: true },
            })
          : Promise.resolve(null),
        prisma.user.count(),
      ]);

      // A new account is a registration: hold it to the signup policy so an
      // invite-only deployment is not open to anyone with a Google/Facebook login.
      const decision = oauthSignInDecision({
        email,
        identityKnown: Boolean(alreadyLinked),
        userWithEmailExists: Boolean(existing),
        existingUserCount: userCount,
      });
      if (!decision.allowed) {
        console.warn(`[auth] refused OAuth sign-up: ${decision.reason}`);
        return false;
      }

      if (account.provider !== "google" || !account.providerAccountId) {
        return true;
      }

      // Linking applies only to Google, whose claim that the address is verified
      // we can check. Facebook returns no such claim, so it is never merged.
      if (!email || claims?.email_verified !== true || !existing || alreadyLinked) {
        return true;
      }

      // Never attach a Google login to a password account whose owner never
      // proved the address: that is how a pre-registered account is hijacked.
      if (!mayLinkOAuthToExisting(existing)) {
        console.warn("[auth] refused to link Google to an unverified password account");
        return false;
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
    async jwt({ token, user, isNewUser }) {
      if (user && isNewUser) {
        // The adapter created this row with the schema default role (ADMIN) and
        // the createUser event only logs if correcting it fails, which would leave
        // a new OAuth user an admin. Correct it again here and let a failure abort
        // the sign-in: fail closed, never open.
        await prisma.user.update({
          where: { id: user.id },
          data: { role: OAUTH_SIGNUP_ROLE },
        });
        // Every account must have a workspace before it can do anything: make
        // sure the createUser event above did its job (idempotent if it did).
        await createWorkspaceForNewUser({ userId: user.id, name: user.name, email: user.email });
      }
      if (user) {
        token.sub = user.id;
        // Always the stored role, never the adapter's `user.role`: for a new
        // OAuth user that object still carries the pre-correction default.
        token.role = await roleForUser(user.id);
      } else if (token.sub) {
        // Re-read on every session check rather than carrying the role minted at
        // sign-in: an admin's role change must take effect on the member's next
        // request, not whenever their token happens to be re-issued. Server-side
        // gates read the database themselves (requirePermission below and
        // src/lib/tenancy/guard.ts); this keeps the session the UI sees honest.
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
 * Permission guard for routes that touch no workspace-owned rows (user
 * management, invitations, AI keys). Routes that read or write workspace data use
 * `requireWorkspace()` from src/lib/tenancy/guard.ts instead, which also resolves
 * the tenant. Route handlers stay responsible for their own status codes.
 */
export async function requirePermission(permission: Permission): Promise<
  | { ok: true; userId: string; role: Role }
  | { ok: false; status: 401 | 403; error: string }
> {
  const session = await getAuthSession();

  if (!session?.user?.id) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  // The role comes from the database, not from the token: a demotion must bite
  // on the very next request.
  const row = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  if (!row) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  const role: Role = effectiveRole(row.role, await isSoleWorkspaceMember(session.user.id));

  if (!can(role, permission)) {
    return {
      ok: false,
      status: 403,
      error: `Your role (${role}) is not allowed to ${permission}`,
    };
  }

  return { ok: true, userId: session.user.id, role };
}
