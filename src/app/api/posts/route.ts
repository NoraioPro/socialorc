import { NextRequest, NextResponse } from "next/server";
import { getAuthSession, requirePermission } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { PostStatus, Platform, Prisma } from "@prisma/client";
import { z } from "zod";

const createPostSchema = z.object({
  title: z.string().optional(),
  content: z.string().min(1),
  platform: z.nativeEnum(Platform),
  socialAccountId: z.string().optional(),
  scheduledFor: z.string().optional(),
  platformContent: z.record(z.string(), z.any()).optional(),
  mediaAssetIds: z.array(z.string()).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const status = req.nextUrl.searchParams.get("status") as PostStatus | null;
    const platform = req.nextUrl.searchParams.get("platform") as Platform | null;
    const limit = parseInt(req.nextUrl.searchParams.get("limit") || "50");
    const offset = parseInt(req.nextUrl.searchParams.get("offset") || "0");

    const where: {
      userId: string;
      status?: PostStatus;
      platform?: Platform;
    } = { userId: session.user.id };

    if (status) where.status = status;
    if (platform) where.platform = platform;

    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where,
        include: {
          socialAccount: true,
          mediaAssets: {
            include: { mediaAsset: true },
            orderBy: { order: "asc" },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.post.count({ where }),
    ]);

    return NextResponse.json({
      posts,
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error("Error fetching posts:", error);
    return NextResponse.json(
      { error: "Failed to fetch posts" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    // Anyone signed in can read the workspace list, but only roles with
    // posts:create may add content (a CLIENT account is read-only).
    const guard = await requirePermission("posts:create");
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    const body = await req.json();
    const validation = createPostSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid request", details: validation.error.issues },
        { status: 400 }
      );
    }

    const { title, content, platform, socialAccountId, scheduledFor, platformContent, mediaAssetIds } = validation.data;

    if (socialAccountId) {
      const account = await prisma.socialAccount.findFirst({
        where: { id: socialAccountId, userId: guard.userId },
      });
      if (!account) {
        return NextResponse.json(
          { error: "Social account not found" },
          { status: 404 }
        );
      }
    }

    const post = await prisma.post.create({
      data: {
        userId: guard.userId,
        title,
        content,
        platform,
        socialAccountId,
        scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
        platformContent: platformContent as Prisma.InputJsonValue | undefined,
        status: PostStatus.DRAFT,
        mediaAssets: mediaAssetIds
          ? {
              create: mediaAssetIds.map((id, index) => ({
                mediaAssetId: id,
                order: index,
              })),
            }
          : undefined,
      },
      include: {
        socialAccount: true,
        mediaAssets: {
          include: { mediaAsset: true },
          orderBy: { order: "asc" },
        },
      },
    });

    return NextResponse.json(post, { status: 201 });
  } catch (error) {
    console.error("Error creating post:", error);
    return NextResponse.json(
      { error: "Failed to create post" },
      { status: 500 }
    );
  }
}
