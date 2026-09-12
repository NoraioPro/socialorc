import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthSession } from "@/lib/auth";
import prisma from "@/lib/prisma";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  headline: z.string().trim().max(140),
  bio: z.string().trim().max(1000),
  location: z.string().trim().max(120),
  website: z.union([z.literal(""), z.string().url().max(300)]),
  image: z.union([z.literal(""), z.string().url().max(500)]),
  coverImageUrl: z.union([z.literal(""), z.string().url().max(500)]),
});
const select = { id: true, name: true, email: true, image: true, headline: true, bio: true, location: true, website: true, coverImageUrl: true, role: true, createdAt: true } as const;

export async function GET() {
  const session = await getAuthSession();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [profile, posts, counts] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.user.id }, select }),
    prisma.post.findMany({ where: { userId: session.user.id }, orderBy: { createdAt: "desc" }, take: 12, include: { mediaAssets: { include: { mediaAsset: true }, take: 1 } } }),
    prisma.post.groupBy({ by: ["status"], where: { userId: session.user.id }, _count: true }),
  ]);
  if (!profile) return NextResponse.json({ error: "Profile not found." }, { status: 404 });
  return NextResponse.json({ profile, posts, counts });
}

export async function PATCH(request: Request) {
  const session = await getAuthSession();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check your profile fields and image links." }, { status: 400 });
  const data = Object.fromEntries(Object.entries(parsed.data).map(([key, value]) => [key, value || null]));
  const profile = await prisma.user.update({ where: { id: session.user.id }, data, select });
  return NextResponse.json({ profile });
}
