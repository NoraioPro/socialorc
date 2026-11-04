import { blobPathFor } from "@/lib/social/blob-upload";
import { blobStorageIsUnconfigured, errorFromResponse } from "@/lib/media/upload-errors";

/**
 * Upload an image the same way the Create page does: straight to Vercel Blob
 * from the browser, falling back to the small-file route only when Blob is not
 * configured (local dev, where the result is a data: URL that can't be published).
 */
export async function uploadImage(file: File, userId: string): Promise<string> {
  if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) throw new Error("Use a PNG, JPEG, WebP or GIF image.");
  if (file.size > 15 * 1024 * 1024) throw new Error("Images can be up to 15 MB.");
  const { upload } = await import("@vercel/blob/client");
  try {
    const blob = await upload(blobPathFor(userId, file.name), file, { access: "public", handleUploadUrl: "/api/media/upload-token" });
    const res = await fetch("/api/media/finalize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: blob.url, pathname: blob.pathname, mimeType: blob.contentType || file.type, filename: file.name, size: file.size }),
    });
    if (!res.ok) throw new Error(await errorFromResponse(res, "Could not save the upload"));
    return ((await res.json()) as { url: string }).url;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not upload the image.";
    if (!blobStorageIsUnconfigured(message)) throw err;
    const body = new FormData();
    body.append("file", file);
    const res = await fetch("/api/media", { method: "POST", body });
    if (!res.ok) throw new Error(await errorFromResponse(res, "Could not upload the image"));
    return ((await res.json()) as { url: string }).url;
  }
}
