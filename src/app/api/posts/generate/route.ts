import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { 
  aiStudioGenerate, 
  improveContent, 
  suggestBestTimes,
  isOpenAIAvailable,
  AINotConfiguredError,
} from "@/lib/ai";
import { Platform } from "@prisma/client";
import { z } from "zod";
import { BrandContext } from "@/types/brand-brain";

const brandContextSchema = z.object({
  profile: z.object({
    name: z.string().optional(),
    tagline: z.string().optional(),
    description: z.string().optional(),
    industry: z.string().optional(),
    targetAudience: z.string().optional(),
    differentiators: z.array(z.string()).optional(),
    competitors: z.array(z.string()).optional(),
  }).optional(),
  voice: z.object({
    toneKeywords: z.array(z.string()).optional(),
    vocabularyIncludes: z.array(z.string()).optional(),
    vocabularyExcludes: z.array(z.string()).optional(),
    examplePhrases: z.array(z.string()).optional(),
    formalityLevel: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).optional(),
  }).optional(),
  goals: z.array(z.object({
    id: z.string(),
    description: z.string(),
    platforms: z.array(z.nativeEnum(Platform)),
    priority: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
    keywords: z.array(z.string()),
  })).optional(),
}).optional();

const generateSchema = z.object({
  idea: z.string().min(1),
  platforms: z.array(z.nativeEnum(Platform)).min(1),
  tone: z.string().optional(),
  additionalContext: z.string().optional(),
  brandContext: brandContextSchema,
  forceMock: z.boolean().optional(),
});

const improveSchema = z.object({
  content: z.string().min(1),
  platform: z.nativeEnum(Platform),
  instruction: z.string().min(1),
  forceMock: z.boolean().optional(),
});

const bestTimesSchema = z.object({
  platform: z.nativeEnum(Platform),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const action = body.action || "generate";

    if (action === "generate") {
      const validation = generateSchema.safeParse(body);
      if (!validation.success) {
        return NextResponse.json(
          { error: "Invalid request", details: validation.error.issues },
          { status: 400 }
        );
      }

      const { idea, platforms, tone, additionalContext, brandContext, forceMock } = validation.data;

      try {
        const result = await aiStudioGenerate({
          idea,
          platforms,
          tone,
          additionalContext,
          brandContext: brandContext as BrandContext | undefined,
          forceMock,
        });

        return NextResponse.json({
          success: true,
          variants: result.variants,
          usedMock: result.usedMock,
          brandContextUsed: result.brandContextUsed,
          openAIAvailable: isOpenAIAvailable(),
        });
      } catch (error) {
        if (error instanceof AINotConfiguredError) {
          return NextResponse.json(
            { error: error.message, code: error.code },
            { status: 503 }
          );
        }
        if (error instanceof Error && error.message.includes("API key")) {
          return NextResponse.json(
            { error: error.message },
            { status: 503 }
          );
        }
        throw error;
      }
    } else if (action === "improve") {
      const validation = improveSchema.safeParse(body);
      if (!validation.success) {
        return NextResponse.json(
          { error: "Invalid request", details: validation.error.issues },
          { status: 400 }
        );
      }

      const { content, platform, instruction, forceMock } = validation.data;

      try {
        const result = await improveContent(content, platform, instruction, forceMock);

        return NextResponse.json({
          success: true,
          content: result.content,
          usedMock: result.isMock,
          openAIAvailable: isOpenAIAvailable(),
        });
      } catch (error) {
        if (error instanceof AINotConfiguredError) {
          return NextResponse.json(
            { error: error.message, code: error.code },
            { status: 503 }
          );
        }
        if (error instanceof Error && error.message.includes("API key")) {
          return NextResponse.json(
            { error: error.message },
            { status: 503 }
          );
        }
        throw error;
      }
    } else if (action === "best-times") {
      const validation = bestTimesSchema.safeParse(body);
      if (!validation.success) {
        return NextResponse.json(
          { error: "Invalid request", details: validation.error.issues },
          { status: 400 }
        );
      }

      const { platform } = validation.data;
      const suggestions = await suggestBestTimes(platform);

      return NextResponse.json({
        success: true,
        ...suggestions,
      });
    }

    return NextResponse.json(
      { error: "Invalid action. Use 'generate', 'improve', or 'best-times'" },
      { status: 400 }
    );
  } catch (error) {
    if (error instanceof AINotConfiguredError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 503 }
      );
    }
    console.error("Error in generate API:", error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}
