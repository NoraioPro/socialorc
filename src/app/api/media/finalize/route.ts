import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireWorkspace } from "@/lib/tenancy/guard";
import {
  ALLOWED_UPLOAD_CONTENT_TYPES,
  MAX_UPLOAD_BYTES,
  blobPathFromUrl,
  blobUrlProblem,
  isAllowedUploadType,
} from "@/lib/social/blob-upload";

/**
 * Records a MediaAsset for a file the browser already uploaded directly to
 * Vercel Blob (see /api/media/upload-token). The asset row itself never
 * carries the file through this app's server, only its metadata.
 */
const finalizeSchema = z.object({
  url: z.string().url(),
  // Kept for backwards compatibility with older clients; the stored path is
  // derived from the URL instead, because a client-supplied pathname is not
  // evidence of anything.
  pathname: z.string().min(1).optional(),
  mimeType: z.string().min(1),
  filename: z.string().min(1),
  size: z.number().int().nonnegative(),
});

export async function POST(req: NextRequest) {
  try {
    // Finalising writes a MediaAsset row into the workspace library.
    const permission = await requireWorkspace("media:upload");
    if (!permission.ok) {
      return NextResponse.json({ error: permission.error }, { status: permission.status });
    }

    // A body that is not JSON is the client's mistake (400), not a server fault.
    const validation = finalizeSchema.safeParse(await req.json().catch(() => null));
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid upload metadata", details: validation.error.flatten() },
        { status: 400 }
      );
    }
    const { url, mimeType, filename, size } = validation.data;

    // The URL must be a blob inside the caller's own folder. A substring test on
    // the whole string used to let `https://evil/.public.blob.vercel-storage.com/x`
    // and any other tenant's blob through — and the recorded URL is fetched by
    // the adapters on publish, so that was an SSRF primitive, not just bookkeeping.
    // The upload token issues per-user folders (blob paths are not access
    // control — the row's workspaceId is), so the folder check stays per user.
    const problem = blobUrlProblem(url, permission.userId);
    if (problem) {
      return NextResponse.json({ error: problem }, { status: 400 });
    }

    // The client also got to state the type and size, which drive capability
    // validation. Keep them inside the same envelope the upload token issued.
    if (!isAllowedUploadType(mimeType)) {
      return NextResponse.json(
        {
          error: `Unsupported file type. Allowed: ${ALLOWED_UPLOAD_CONTENT_TYPES.join(", ")}`,
        },
        { status: 400 }
      );
    }
    if (size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: `File is too large. Maximum is ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))} MB.` },
        { status: 400 }
      );
    }

    const asset = await prisma.mediaAsset.create({
      data: {
        userId: permission.userId,
        workspaceId: permission.workspaceId,
        filename,
        mimeType,
        size,
        url,
        blobPath: blobPathFromUrl(url),
      },
    });

    return NextResponse.json(asset, { status: 201 });
  } catch (error) {
    console.error("Error finalizing media upload:", error);
    return NextResponse.json({ error: "Failed to save the upload" }, { status: 500 });
  }
}
