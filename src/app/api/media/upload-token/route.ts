import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import {
  ALLOWED_UPLOAD_CONTENT_TYPES,
  MAX_UPLOAD_BYTES,
  blobFolderFor,
} from "@/lib/social/blob-upload";

/**
 * Issues a short-lived token so the browser can upload a file straight to
 * Vercel Blob, never through this app's own function.
 *
 * That is not an optimization: Vercel's serverless functions cap the request
 * body at a few megabytes, so any real video sent through a normal API route
 * (like /api/media) is rejected before the app ever sees it, and the platform's
 * own error page is plain text, not JSON. Routing the upload directly to Blob
 * has no such limit.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        // Single source of truth: /api/media/finalize enforces the same list.
        allowedContentTypes: [...ALLOWED_UPLOAD_CONTENT_TYPES],
        addRandomSuffix: true,
        maximumSizeInBytes: MAX_UPLOAD_BYTES,
        // The folder the client is expected to upload into. The finalize route
        // independently proves the resulting URL sits inside it for this user.
        tokenPayload: JSON.stringify({
          userId: session.user.id,
          folder: blobFolderFor(session.user.id),
        }),
      }),
      // Best-effort only: this webhook needs a publicly reachable deployment,
      // so it never fires against localhost. The client finalizes the asset
      // itself via /api/media/finalize right after the upload resolves, which
      // is what every caller actually relies on.
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not start the upload." },
      { status: 400 }
    );
  }
}
