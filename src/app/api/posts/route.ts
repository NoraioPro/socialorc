import { NextRequest, NextResponse } from "next/server";
import { getAuthSession, requirePermission } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { workspaceIdForWrite } from "@/lib/tenancy/workspace";
import { PostStatus, Platform, Prisma } from "@prisma/client";
import { z } from "zod";
import { POST_SAFE_INCLUDE, unownedMediaAssetIds } from "@/lib/social/account-select";

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
    // An unbounded `limit` let any signed-in caller ask for the whole table.
    const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : 50;
    const safeOffset = Number.isFinite(offset) ? Math.max(offset, 0) : 0;

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
        include: POST_SAFE_INCLUDE,
        orderBy: { createdAt: "desc" },
        take: safeLimit,
        skip: safeOffset,
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

    // A post with no account attached can never be scheduled or published - it
    // strands in DRAFT. The create form does not always carry the choice, and
    // there is one connected account per platform, so resolve it here rather
    // than leaving the link null and failing later with "No social account".
    let resolvedAccountId = socialAccountId;

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
    } else {
      const account = await prisma.socialAccount.findFirst({
        where: { userId: guard.userId, platform, isActive: true },
        orderBy: { createdAt: "asc" },
      });
      resolvedAccountId = account?.id;
    }

    // Media ids are client-supplied: without this check any caller could attach
    // (and then read the URL of) another tenant's asset, and publish a file they
    // never uploaded.
    if (mediaAssetIds && mediaAssetIds.length > 0) {
      const unowned = await unownedMediaAssetIds(guard.userId, mediaAssetIds);
      if (unowned.length > 0) {
        return NextResponse.json(
          { error: "One or more media assets were not found" },
          { status: 404 }
        );
      }
    }

    const post = await prisma.post.create({
      data: {
        workspaceId: await workspaceIdForWrite(guard.userId),
        userId: guard.userId,
        title,
        content,
        platform,
        socialAccountId: resolvedAccountId,
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
      include: POST_SAFE_INCLUDE,
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
