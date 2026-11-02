"use client";

import { upload } from "@vercel/blob/client";

/**
 * Uploads a file from the browser straight to Blob storage.
 *
 * Why: `POST /api/media` receives the whole file in a serverless function, and
 * Vercel rejects any request body over 4.5MB with a 413 — which is every real
 * video. Going direct also keeps the function's CPU/memory out of the path.
 */
export interface UploadedMedia {
  id: string;
  url: string;
  filename: string;
  mimeType: string;
  devOnly?: boolean;
}

/** Files above this size cannot go through `POST /api/media` at all. */
export const DIRECT_UPLOAD_THRESHOLD = 4 * 1024 * 1024;

export async function uploadMediaDirect(file: File): Promise<UploadedMedia> {
  const blob = await upload(`socialorc/${Date.now()}-${file.name}`, file, {
    access: "public",
    handleUploadUrl: "/api/media/upload",
    contentType: file.type,
    multipart: true,
  });

  const res = await fetch("/api/media/link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: blob.url,
      pathname: blob.pathname,
      filename: file.name,
      mimeType: file.type,
      size: file.size,
    }),
  });

  const data = (await res.json().catch(() => ({}))) as Partial<UploadedMedia> & { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? `Upload failed (${res.status}).`);
  }

  return {
    id: String(data.id ?? ""),
    url: String(data.url ?? blob.url),
    filename: String(data.filename ?? file.name),
    mimeType: String(data.mimeType ?? file.type),
    devOnly: false,
  };
}
