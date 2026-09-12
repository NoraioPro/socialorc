import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { DEFAULT_ROLE, selfSignupRole } from "@/lib/roles";
import { signupDecision } from "@/lib/signup-policy";

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

    // One count, two decisions: whether this signup is allowed at all, and which
    // role it gets. Reading it once also avoids a race where both an "allowed"
    // check and a "first account" check disagree.
    const userCount = await prisma.user.count();

    // Invite-only by default - see src/lib/signup-policy.ts. The first account
    // is always allowed, so a fresh deployment can still claim its owner.
    const decision = signupDecision(email, userCount);
    if (!decision.allowed) {
      // The reason goes to the log, not the client: telling the client would
      // reveal which addresses are invited.
      console.warn(`[register] refused signup for ${email}: ${decision.reason}`);
      return NextResponse.json(
        { error: "Registration is invite-only. Ask the workspace owner for an invitation." },
        { status: 403 }
      );
    }

    // The first account owns the workspace. Everyone after must NOT become an
    // admin just by filling in this form: ADMIN carries `users:manage` and
    // `posts:delete`. auth.ts applies the same rule to OAuth sign-ups.
    const role = userCount === 0 ? DEFAULT_ROLE : selfSignupRole();

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
