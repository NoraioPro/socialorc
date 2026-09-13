import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { put } from "@vercel/blob";
import { mediaStorage } from "@/lib/media-storage";

export async function GET(req: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    const [assets, total] = await Promise.all([
      prisma.mediaAsset.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.mediaAsset.count({ where: { userId: session.user.id } }),
    ]);

    return NextResponse.json({ assets, total, limit, offset });
  } catch (error) {
    console.error("Error fetching media:", error);
    return NextResponse.json(
      { error: "Failed to fetch media" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const maxSize = 100 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 100MB." },
        { status: 400 }
      );
    }

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "video/mp4",
      "video/quicktime",
      "video/webm",
    ];

    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: `File type not allowed: ${file.type}` },
        { status: 400 }
      );
    }

    const storage = mediaStorage();

    // Production must never store media as a base64 `data:` URL: social APIs need
    // a fetchable https URL, and the data URI also puts the entire payload in
    // Postgres. Failing here is honest; producing an asset that can never be
    // published is not.
    if (storage === "unconfigured") {
      return NextResponse.json(
        {
          success: false,
          error: "Media storage is not configured",
          code: "MEDIA_STORAGE_NOT_CONFIGURED",
        },
        { status: 503 }
      );
    }

    let url: string;
    let blobPath: string | null = null;

    if (storage === "blob") {
      const blob = await put(`socialorc/${session.user.id}/${Date.now()}-${file.name}`, file, {
        access: "public",
      });
      url = blob.url;
      blobPath = blob.pathname;
    } else {
      // Development only — kept so local flows work without a Blob store. These
      // assets cannot be published, which is exactly why production refuses them
      // above. The stored MIME type still travels with the asset, so platform
      // validation is not fooled by the data URI.
      const bytes = await file.arrayBuffer();
      const base64 = Buffer.from(bytes).toString("base64");
      url = `data:${file.type};base64,${base64}`;
    }

    const asset = await prisma.mediaAsset.create({
      data: {
        userId: session.user.id,
        filename: file.name,
        mimeType: file.type,
        size: file.size,
        url,
        blobPath,
      },
    });

    return NextResponse.json(asset, { status: 201 });
  } catch (error) {
    console.error("Error uploading media:", error);
    return NextResponse.json(
      { error: "Failed to upload media" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const assetId = searchParams.get("id");

    if (!assetId) {
      return NextResponse.json({ error: "Asset ID required" }, { status: 400 });
    }

    const asset = await prisma.mediaAsset.findFirst({
      where: { id: assetId, userId: session.user.id },
    });

    if (!asset) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    await prisma.mediaAsset.delete({ where: { id: assetId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting media:", error);
    return NextResponse.json(
      { error: "Failed to delete media" },
      { status: 500 }
    );
  }
}
