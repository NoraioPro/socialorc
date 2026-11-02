import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireWorkspace } from "@/lib/tenancy/guard";

/**
 * Records a media asset that the browser already uploaded straight to Blob
 * storage. The body is a handful of bytes, so nothing here can hit Vercel's
 * 4.5MB request cap (see /api/media/upload).
 */
const MAX_SIZE = 100 * 1024 * 1024;

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "video/mp4",
  "video/quicktime",
  "video/webm",
];

export async function POST(req: NextRequest) {
  try {
    const permission = await requireWorkspace("media:upload");
    if (!permission.ok) {
      return NextResponse.json({ error: permission.error }, { status: permission.status });
    }

    const body = (await req.json().catch(() => ({}))) as {
      url?: string;
      pathname?: string;
      filename?: string;
      mimeType?: string;
      size?: number;
    };

    const url = typeof body.url === "string" ? body.url : "";
    const filename = typeof body.filename === "string" ? body.filename : "";
    const mimeType = typeof body.mimeType === "string" ? body.mimeType : "";
    const size = typeof body.size === "number" ? body.size : 0;

    if (!url.startsWith("https://")) {
      return NextResponse.json({ error: "A stored blob URL is required" }, { status: 400 });
    }
    if (!filename || !mimeType) {
      return NextResponse.json({ error: "filename and mimeType are required" }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(mimeType)) {
      return NextResponse.json({ error: `File type not allowed: ${mimeType}` }, { status: 400 });
    }
    if (size > MAX_SIZE) {
      return NextResponse.json({ error: "File too large. Maximum size is 100MB." }, { status: 400 });
    }

    const asset = await prisma.mediaAsset.create({
      data: {
        userId: permission.userId,
        workspaceId: permission.workspaceId,
        filename,
        mimeType,
        size,
        url,
        blobPath: typeof body.pathname === "string" ? body.pathname : null,
      },
    });

    return NextResponse.json(asset, { status: 201 });
  } catch (error) {
    console.error("Error recording media asset:", error);
    return NextResponse.json({ error: "Failed to record media" }, { status: 500 });
  }
}
