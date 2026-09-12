import { DefaultSession } from "next-auth";
import type { Role, Permission } from "@/lib/roles";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      permissions: readonly Permission[];
    } & DefaultSession["user"];
  }
  interface User {
    role?: Role;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    sub: string;
    role?: Role;
  }
}
