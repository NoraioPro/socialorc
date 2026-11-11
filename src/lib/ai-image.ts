import { put } from "@vercel/blob";
import prisma from "@/lib/prisma";
import { mediaStorage } from "@/lib/media-storage";
import { DEFAULT_BASE_URL, resolveAiConfig, type AiScope } from "@/lib/ai-config";

/**
 * AI image generation on the customer's own key.
 *
 * The `image` AI credential is a separate row from `text` on purpose (see
 * ai-config: a chat key must never be spent on an image endpoint). Like the text
 * path, this never falls back to a deployment key.
 *
 * Providers are addressed through the OpenAI-compatible
 * `POST {baseUrl}/images/generations` shape, which is what OpenAI, Azure-style
 * gateways, LocalAI and the usual local shims expose.
 */

export class AiImageError extends Error {
  readonly code: string;
  constructor(message: string, code = "ai_image_failed") {
    super(message);
    this.name = "AiImageError";
    this.code = code;
  }
}

export interface GeneratedImage {
  id: string;
  url: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface GenerateImageInput {
  prompt: string;
  size?: string;
  model?: string;
  scope: AiScope;
}

const MAX_BYTES = 12 * 1024 * 1024;

const ALLOWED_SIZES = ["1024x1024", "1024x1536", "1536x1024", "512x512"] as const;

function normaliseSize(size: string | undefined): string {
  return ALLOWED_SIZES.includes((size ?? "") as (typeof ALLOWED_SIZES)[number]) ? (size as string) : "1024x1024";
}

export async function generateImage(input: GenerateImageInput): Promise<GeneratedImage> {
  const prompt = input.prompt?.trim();
  if (!prompt) throw new AiImageError("Give the image a prompt.", "invalid_prompt");
  if (prompt.length > 2000) throw new AiImageError("The prompt is too long (2000 characters max).", "invalid_prompt");

  const storage = mediaStorage();
  if (storage === "unconfigured") {
    throw new AiImageError(
      "Media storage is not configured in this deployment (BLOB_READ_WRITE_TOKEN), so generated images cannot be stored.",
      "media_storage_unconfigured",
    );
  }

  const config = await resolveAiConfig(input.scope, "image");
  if (!config) {
    throw new AiImageError(
      "No image key is configured. Add one under Settings → AI → Image key (text keys are separate).",
      "ai_key_required",
    );
  }

  const baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const model = (input.model ?? config.model ?? "gpt-image-1").trim();

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/images/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        prompt,
        n: 1,
        size: normaliseSize(input.size),
        response_format: "b64_json",
      }),
    });
  } catch (error) {
    throw new AiImageError(
      `Could not reach the image provider at ${baseUrl} (${error instanceof Error ? error.message : "network error"}).`,
      "ai_image_unreachable",
    );
  }

  const payload = (await response.json().catch(() => ({}))) as {
    data?: { b64_json?: string; url?: string }[];
    error?: { message?: string } | string;
  };

  if (!response.ok) {
    const detail =
      typeof payload.error === "string" ? payload.error : (payload.error?.message ?? `HTTP ${response.status}`);
    throw new AiImageError(`The image provider refused the request: ${detail}`, "ai_image_provider_error");
  }

  const first = payload.data?.[0];
  let bytes: Buffer;
  if (first?.b64_json) {
    bytes = Buffer.from(first.b64_json, "base64");
  } else if (first?.url) {
    const download = await fetch(first.url).catch(() => null);
    if (!download?.ok) throw new AiImageError("The provider returned an image URL we could not download.", "ai_image_download_failed");
    bytes = Buffer.from(await download.arrayBuffer());
  } else {
    throw new AiImageError("The provider returned no image.", "ai_image_empty");
  }

  if (bytes.byteLength === 0) throw new AiImageError("The provider returned an empty image.", "ai_image_empty");
  if (bytes.byteLength > MAX_BYTES) throw new AiImageError("The generated image is larger than 12MB.", "ai_image_too_large");

  const userId = input.scope.userId;
  const workspaceId = input.scope.workspaceId;
  if (!userId || !workspaceId) {
    throw new AiImageError("A signed-in user inside a workspace is required to store a generated image.", "no_user");
  }

  const filename = `ai-${Date.now()}.png`;
  // Local development without a Blob token stores a data: URL, like uploads do
  // (not publishable to social APIs, fine for trying the flow).
  let url: string;
  let blobPath: string | null = null;
  if (storage === "blob") {
    const blob = await put(`socialorc/${userId}/${filename}`, bytes, { access: "public", contentType: "image/png" });
    url = blob.url;
    blobPath = blob.pathname;
  } else {
    url = `data:image/png;base64,${bytes.toString("base64")}`;
  }

  const asset = await prisma.mediaAsset.create({
    data: {
      userId,
      workspaceId,
      filename,
      mimeType: "image/png",
      size: bytes.byteLength,
      url,
      blobPath,
    },
  });

  return {
    id: asset.id,
    url: asset.url,
    filename: asset.filename,
    mimeType: asset.mimeType,
    size: asset.size,
  };
}
