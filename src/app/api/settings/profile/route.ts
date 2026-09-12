import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import prisma from "@/lib/prisma";

const profileSelect = { name: true, email: true, timezone: true, role: true } as const;

export async function GET() {
  const session = await getAuthSession();
  if (!session?.user?.id) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  try {
    const profile = await prisma.user.findUnique({ where: { id: session.user.id }, select: profileSelect });
    if (!profile) return NextResponse.json({ error: "Account not found." }, { status: 404 });
    return NextResponse.json({ profile });
  } catch {
    return NextResponse.json({ error: "Could not load your profile." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const session = await getAuthSession();
  if (!session?.user?.id) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  let body;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid profile data." }, { status: 400 });
  }
  if (!body || typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 80 || typeof body.timezone !== "string" || body.timezone.length > 100) {
    return NextResponse.json({ error: "Enter a name (up to 80 characters) and a valid time zone." }, { status: 400 });
  }
  try { new Intl.DateTimeFormat("en", { timeZone: body.timezone }); } catch {
    return NextResponse.json({ error: "Choose a valid time zone." }, { status: 400 });
  }
  try {
    const profile = await prisma.user.update({ where: { id: session.user.id }, data: { name: body.name.trim(), timezone: body.timezone }, select: profileSelect });
    return NextResponse.json({ profile });
  } catch {
    return NextResponse.json({ error: "Could not save your profile. Please try again." }, { status: 500 });
  }
}
