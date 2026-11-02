import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireWorkspace } from "@/lib/tenancy/guard";
import { mediaStorage } from "@/lib/media-storage";

/**
 * Client-side uploads. Vercel caps a serverless request body at 4.5MB, so any
 * real video sent to `POST /api/media` died with 413. The browser now uploads
 * straight to Blob storage: this route only mints a short-lived token.
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

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = (await req.json().catch(() => ({}))) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => {
        // Auth runs per token request; uploads without a workspace are refused here.
        const permission = await requireWorkspace("media:upload");
        if (!permission.ok) {
          throw new Error(permission.error);
        }
        if (mediaStorage() !== "blob") {
          throw new Error("Media storage is not configured (BLOB_READ_WRITE_TOKEN).");
        }
        return {
          allowedContentTypes: ALLOWED_TYPES,
          maximumSizeInBytes: MAX_SIZE,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({
            userId: permission.userId,
            workspaceId: permission.workspaceId,
          }),
        };
      },
      onUploadCompleted: async () => {
        // The asset row is created by POST /api/media/link once the browser has
        // the final URL, so there is nothing to do here.
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload token failed";
    console.error("Error generating upload token:", error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
