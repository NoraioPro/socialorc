import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import {
  INVITATION_TTL_MS,
  ROLE_VALUES,
  createInvitationToken,
  isRoleValue,
  normalizeEmail,
} from "@/lib/invitations";

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Pending invitations: not yet accepted and not yet expired. */
export async function GET() {
  const guard = await requirePermission("users:manage");
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const invitations = await prisma.invitation.findMany({
    where: { acceptedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true, email: true, role: true, invitedBy: true, expiresAt: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ invitations, roles: ROLE_VALUES });
}

/**
 * Invite somebody with a role.
 *
 * The raw token is returned exactly once, here; only its hash is stored, so a
 * dump of the database cannot be turned into working signup links. Signup itself
 * is invite-only by default (src/lib/signup-policy.ts), so this is the door that
 * makes MANAGER and CLIENT reachable at all.
 */
export async function POST(req: NextRequest) {
  const guard = await requirePermission("users:manage");
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  let body: { email?: unknown; role?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = normalizeEmail(typeof body.email === "string" ? body.email : "");
  if (!EMAIL_SHAPE.test(email)) {
    return NextResponse.json({ error: "A valid email address is required" }, { status: 400 });
  }

  const role = body.role === undefined ? "EDITOR" : body.role;
  if (!isRoleValue(role)) {
    return NextResponse.json({ error: `Role must be one of: ${ROLE_VALUES.join(", ")}.` }, { status: 400 });
  }

  const existingUser = await prisma.user.findFirst({ where: { email }, select: { id: true } });
  if (existingUser) {
    return NextResponse.json({ error: "That email already has an account" }, { status: 409 });
  }

  const { token, tokenHash } = createInvitationToken();
  const invitation = await prisma.invitation.create({
    data: {
      email,
      role,
      tokenHash,
      invitedBy: guard.userId,
      expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
    },
    select: { id: true, email: true, role: true, expiresAt: true },
  });

  return NextResponse.json(
    {
      success: true,
      invitation,
      // Shown once. Send it to the invitee; it cannot be read back afterwards.
      token,
      acceptancePath: `/register?invite=${token}`,
      expiresInMs: INVITATION_TTL_MS,
    },
    { status: 201 }
  );
}
