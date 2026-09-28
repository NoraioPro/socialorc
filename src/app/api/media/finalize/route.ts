import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthSession } from "@/lib/auth";
import prisma from "@/lib/prisma";

/**
 * Records a MediaAsset for a file the browser already uploaded directly to
 * Vercel Blob (see /api/media/upload-token). The asset row itself never
 * carries the file through this app's server, only its metadata.
 */
const finalizeSchema = z.object({
  url: z.string().url(),
  pathname: z.string().min(1),
  mimeType: z.string().min(1),
  filename: z.string().min(1),
  size: z.number().int().nonnegative(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const validation = finalizeSchema.safeParse(await req.json());
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid upload metadata", details: validation.error.flatten() },
        { status: 400 }
      );
    }
    const { url, pathname, mimeType, filename, size } = validation.data;

    // The URL must actually be a blob this token scheme issued, not an
    // arbitrary address the client asks us to record.
    if (!url.includes(".public.blob.vercel-storage.com/")) {
      return NextResponse.json({ error: "Not a recognized upload" }, { status: 400 });
    }

    const asset = await prisma.mediaAsset.create({
      data: {
        userId: session.user.id,
        filename,
        mimeType,
        size,
        url,
        blobPath: pathname,
      },
    });

    return NextResponse.json(asset, { status: 201 });
  } catch (error) {
    console.error("Error finalizing media upload:", error);
    return NextResponse.json({ error: "Failed to save the upload" }, { status: 500 });
  }
}
