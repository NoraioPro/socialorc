import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Platform, PostStatus } from "@prisma/client";
import { z } from "zod";
import {
  cascadeContent,
  extractHashtags,
  validateCascadeSource,
  getAvailableCascadeTargets,
} from "@/lib/cascade";

const cascadeSchema = z.object({
  targetPlatforms: z.array(z.nativeEnum(Platform)).min(1),
  createDrafts: z.boolean().default(false),
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * GET /api/posts/[id]/cascade
 * Returns available cascade targets for a post.
 */
export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;

    const post = await prisma.post.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const validation = validateCascadeSource(post.content, post.platform);
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.reason },
        { status: 400 }
      );
    }

    const availableTargets = getAvailableCascadeTargets(post.platform);

    return NextResponse.json({
      postId: post.id,
      sourcePlatform: post.platform,
      sourceContent: post.content,
      availableTargets: availableTargets.map((t) => ({
        platform: t.id,
        name: t.name,
        maxTextLength: t.maxTextLength,
        capabilities: t.capabilities,
      })),
    });
  } catch (error) {
    console.error("Error fetching cascade targets:", error);
    return NextResponse.json(
      { error: "Failed to fetch cascade targets" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/posts/[id]/cascade
 * Cascade a post's content to multiple platforms.
 *
 * Body:
 * - targetPlatforms: Platform[] - platforms to adapt content for
 * - createDrafts: boolean - whether to create draft posts for each adaptation
 */
export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await req.json();
    const validation = cascadeSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid request", details: validation.error.issues },
        { status: 400 }
      );
    }

    const { targetPlatforms, createDrafts } = validation.data;

    const post = await prisma.post.findFirst({
      where: { id, userId: session.user.id },
      include: {
        socialAccount: true,
        mediaAssets: {
          include: { mediaAsset: true },
          orderBy: { order: "asc" },
        },
      },
    });

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    // Only allow cascade from DRAFT or APPROVED posts
    if (!["DRAFT", "PENDING_APPROVAL", "APPROVED"].includes(post.status)) {
      return NextResponse.json(
        { error: `Cannot cascade from a post with status: ${post.status}` },
        { status: 400 }
      );
    }

    const sourceValidation = validateCascadeSource(post.content, post.platform);
    if (!sourceValidation.valid) {
      return NextResponse.json(
        { error: sourceValidation.reason },
        { status: 400 }
      );
    }

    // Extract hashtags from original content
    const hashtags = extractHashtags(post.content);

    // Perform cascade
    const result = await cascadeContent(
      {
        content: post.content,
        platform: post.platform,
        hashtags,
      },
      targetPlatforms
    );

    // Optionally create draft posts for each adaptation
    let createdPosts: { id: string; platform: Platform }[] = [];

    if (createDrafts) {
      createdPosts = await Promise.all(
        result.adaptations.map(async (adaptation) => {
          const newPost = await prisma.post.create({
            data: {
              userId: session.user.id,
              content: adaptation.content,
              platform: adaptation.platform,
              status: PostStatus.DRAFT,
              title: post.title ? `${post.title} (${adaptation.platform})` : null,
              platformContent: {
                cascadedFrom: post.id,
                cascadedAt: new Date().toISOString(),
                adaptationNotes: adaptation.adaptationNotes,
              },
            },
          });
          return { id: newPost.id, platform: newPost.platform };
        })
      );
    }

    return NextResponse.json({
      success: true,
      source: {
        postId: post.id,
        platform: post.platform,
        content: post.content,
      },
      adaptations: result.adaptations,
      usedMock: result.usedMock,
      createdDrafts: createdPosts,
    });
  } catch (error) {
    console.error("Error cascading post:", error);
    return NextResponse.json(
      { error: "Failed to cascade post" },
      { status: 500 }
    );
  }
}
