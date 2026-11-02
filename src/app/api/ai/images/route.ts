import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/tenancy/guard";
import { AiImageError, generateImage } from "@/lib/ai-image";

/**
 * POST /api/ai/images — generate one image on the customer's own image key and
 * store it as a media asset, so the composer can attach it to a post straight
 * away (the same asset ids media upload returns).
 */
export async function POST(req: NextRequest) {
  try {
    const permission = await requireWorkspace("media:upload");
    if (!permission.ok) {
      return NextResponse.json({ error: permission.error }, { status: permission.status });
    }

    const body = (await req.json().catch(() => ({}))) as {
      prompt?: string;
      size?: string;
      model?: string;
    };

    const asset = await generateImage({
      prompt: body.prompt ?? "",
      size: body.size,
      model: body.model,
      scope: { userId: permission.userId, workspaceId: permission.workspaceId },
    });

    return NextResponse.json(asset, { status: 201 });
  } catch (error) {
    if (error instanceof AiImageError) {
      const status = error.code === "ai_key_required" ? 400 : error.code === "media_storage_unconfigured" ? 503 : 502;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
    console.error("Error generating image:", error);
    return NextResponse.json({ error: "Failed to generate the image" }, { status: 500 });
  }
}
