import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireWorkspace } from "@/lib/tenancy/guard";
import { encrypt } from "@/lib/encryption";

export const dynamic = "force-dynamic";

const PLATFORMS = ["LINKEDIN", "TWITTER", "TIKTOK", "FACEBOOK", "INSTAGRAM", "YOUTUBE"] as const;

const saveSchema = z.object({
  platform: z.enum(PLATFORMS),
  appId: z.string().trim().min(6).max(200),
  appSecret: z.string().trim().min(6).max(400),
});

/** GET /api/platform-credentials — which apps this workspace has stored (never the secret). */
export async function GET() {
  const guard = await requireWorkspace("accounts:connect");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const rows = await prisma.workspacePlatformCredential.findMany({
    where: { workspaceId: guard.workspaceId },
    select: { platform: true, appId: true, updatedAt: true },
  });

  return NextResponse.json({
    platforms: PLATFORMS,
    stored: rows.map((r) => ({ platform: r.platform, appId: r.appId, updatedAt: r.updatedAt })),
  });
}

/** POST — store (or replace) this workspace's own OAuth app for one platform. */
export async function POST(req: NextRequest) {
  const guard = await requireWorkspace("accounts:connect");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const parsed = saveSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Give the platform's app id and app secret (at least 6 characters each)." },
      { status: 400 },
    );
  }

  const { platform, appId, appSecret } = parsed.data;
  await prisma.workspacePlatformCredential.upsert({
    where: { workspaceId_platform: { workspaceId: guard.workspaceId, platform } },
    create: { workspaceId: guard.workspaceId, platform, appId, encryptedAppSecret: encrypt(appSecret) },
    update: { appId, encryptedAppSecret: encrypt(appSecret) },
  });

  return NextResponse.json({ success: true, platform });
}

/** DELETE /api/platform-credentials?platform=LINKEDIN — fall back to the deployment app. */
export async function DELETE(req: NextRequest) {
  const guard = await requireWorkspace("accounts:connect");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const platform = req.nextUrl.searchParams.get("platform");
  if (!platform || !PLATFORMS.includes(platform as (typeof PLATFORMS)[number])) {
    return NextResponse.json({ error: "Unknown platform" }, { status: 400 });
  }

  await prisma.workspacePlatformCredential.deleteMany({
    where: { workspaceId: guard.workspaceId, platform: platform as (typeof PLATFORMS)[number] },
  });
  return NextResponse.json({ success: true });
}
