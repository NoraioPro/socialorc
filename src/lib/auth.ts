import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth/next";
import CredentialsProvider from "next-auth/providers/credentials";
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

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as NextAuthOptions["adapter"],
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  providers: [
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
