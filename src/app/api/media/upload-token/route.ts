import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/tenancy/guard";
import { enforceRateLimit } from "@/lib/rate-limit-guard";
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
  // Minting a client upload token lets the holder write objects straight to
  // the blob store, so it is the same workspace-resolved upload permission the
  // finalize step checks — not just a session.
  const permission = await requireWorkspace("media:upload");
  if (!permission.ok) {
    return NextResponse.json({ error: permission.error }, { status: permission.status });
  }
  const userId = permission.userId;

  // …and worth a budget.
  const limited = await enforceRateLimit("upload", `user:${userId}`);
  if (limited) return limited;

  // Parsed outside the try below, so a non-JSON body used to escape as an
  // unhandled 500. It is a malformed request.
  const body = (await request.json().catch(() => null)) as HandleUploadBody | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid upload request" }, { status: 400 });
  }

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
          userId,
          folder: blobFolderFor(userId),
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
