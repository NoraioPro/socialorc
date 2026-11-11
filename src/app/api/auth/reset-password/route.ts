import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { fingerprint, readResetToken } from "@/lib/password-reset";

const MIN = 8;

/** Public by design: the signed, single-use token is the credential. */
export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => null)) as { token?: string; password?: string } | null;
  const t = b?.token ? readResetToken(b.token) : null;
  if (!t) return NextResponse.json({ error: "This reset link is invalid or has expired." }, { status: 400 });
  if (!b?.password || b.password.length < MIN) return NextResponse.json({ error: `Use at least ${MIN} characters.` }, { status: 400 });
  const user = await prisma.user.findUnique({ where: { id: t.userId }, select: { id: true, password: true } });
  if (!user || fingerprint(user.password) !== t.fingerprint) return NextResponse.json({ error: "This reset link was already used or is no longer valid." }, { status: 400 });
  await prisma.user.update({ where: { id: user.id }, data: { password: await bcrypt.hash(b.password, 12) } });
  return NextResponse.json({ success: true });
}
