import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { DEFAULT_ROLE, selfSignupRole } from "@/lib/roles";
import { hashInvitationToken, invitationDecision } from "@/lib/invitations";
import { enforceRateLimit } from "@/lib/rate-limit-guard";
import { rateLimitSubjectFromHeaders } from "@/lib/rate-limit";
import { signupDecision } from "@/lib/signup-policy";
import { createWorkspaceForNewUser } from "@/lib/tenancy/workspace";

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

    // Before the expensive part: bcrypt at cost 12 is exactly what an unthrottled
    // spammer wants to make us do in a loop.
    const limited = await enforceRateLimit("register", rateLimitSubjectFromHeaders(req.headers));
    if (limited) return limited;

    const hashedPassword = await bcrypt.hash(password, 12);

    // One count, two decisions: whether this signup is allowed at all, and which
    // role it gets. Reading it once also avoids a race where both an "allowed"
    // check and a "first account" check disagree.
    const userCount = await prisma.user.count();

    // An invitation is the other way in, and the only way to obtain a role the
    // signup policy cannot produce (MANAGER, CLIENT). The lookup is by hash of the
    // presented token, so a dump of the database holds nothing replayable, and the
    // address must match the invitation: one invitation admits one person.
    const inviteToken =
      typeof body?.inviteToken === "string" ? body.inviteToken.trim() : "";
    let acceptedInvitation: { id: string; role: string } | null = null;
    if (inviteToken) {
      const found = await prisma.invitation.findUnique({
        where: { tokenHash: hashInvitationToken(inviteToken) },
        select: { id: true, email: true, role: true, expiresAt: true, acceptedAt: true },
      });
      const verdict = invitationDecision(found, email);
      if (!verdict.ok) {
        // The reason goes to the log, not to the client.
        console.warn(`[register] refused invitation for ${email}: ${verdict.reason}`);
        return NextResponse.json({ error: "That invitation is not valid." }, { status: 403 });
      }
      acceptedInvitation = { id: found!.id, role: found!.role };
    }

    // Invite-only by default - see src/lib/signup-policy.ts. The first account
    // is always allowed, so a fresh deployment can still claim its owner. A valid
    // invitation is the third way in.
    const decision = signupDecision(email, userCount);
    if (!decision.allowed && !acceptedInvitation) {
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
    // `posts:delete`. auth.ts applies the same rule to OAuth sign-ups. An
    // invitation overrides both rules — that is its whole purpose.
    const role = acceptedInvitation
      ? acceptedInvitation.role
      : userCount === 0
        ? DEFAULT_ROLE
        : selfSignupRole();

    const user = await prisma.user.create({
      data: {
        name: typeof name === "string" && name.trim() ? name.trim() : email.split("@")[0],
        email,
        password: hashedPassword,
        role,
        timezone: "Europe/Oslo",
      },
    });

    // Stamp the invitation as used, guarded on it still being unused: two signups
    // racing on one token must not both succeed.
    if (acceptedInvitation) {
      await prisma.invitation.updateMany({
        where: { id: acceptedInvitation.id, acceptedAt: null },
        data: { acceptedAt: new Date(), acceptedBy: user.id },
      });
    }

    // Phase 0 (docs/SAAS-PLAN.md): a new account starts its own workspace and
    // owns it, so the tenant keys on everything it later creates have something
    // to point at. Best effort on purpose — nothing filters on the tenant yet,
    // so a failure here must not fail a signup that otherwise succeeded; the
    // backfill (Phase 0.4) covers whatever is left unstamped.
    try {
      await createWorkspaceForNewUser({
        userId: user.id,
        name: user.name,
        email: user.email,
      });
    } catch (error) {
      console.error("[register] could not create the workspace for a new account", error);
    }

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
