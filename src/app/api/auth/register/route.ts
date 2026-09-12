import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { DEFAULT_ROLE, selfSignupRole } from "@/lib/roles";

const MIN_PASSWORD_LENGTH = 8;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);

    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { name, password } = body as { name?: unknown; password?: unknown };
    // Emails are matched exactly at login, so store and compare one canonical
    // form or "Hassan@x.com" can never sign in as "hassan@x.com".
    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!email || typeof password !== "string") {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "Please enter a valid email address" },
        { status: 400 }
      );
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
        { status: 400 }
      );
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "User with this email already exists" },
        { status: 400 }
      );
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    // The first account bootstraps the workspace and owns it. Every account
    // after that must NOT become an admin just by filling in this public form:
    // ADMIN carries `users:manage` and `posts:delete`. auth.ts applies the same
    // least-privilege rule to OAuth sign-ups, for the same reason.
    const isFirstAccount = (await prisma.user.count()) === 0;
    const role = isFirstAccount ? DEFAULT_ROLE : selfSignupRole();

    const user = await prisma.user.create({
      data: {
        name: typeof name === "string" && name.trim() ? name.trim() : email.split("@")[0],
        email,
        password: hashedPassword,
        role,
        timezone: "Europe/Oslo",
      },
    });

    return NextResponse.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    });
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "Failed to register user" },
      { status: 500 }
    );
  }
}
