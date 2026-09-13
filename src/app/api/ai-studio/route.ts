import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import {
  aiStudioGenerate,
  improveContent,
  isOpenAIAvailable,
  isMockAIAllowed,
  AINotConfiguredError,
  GeneratedVariant,
} from "@/lib/ai";
import { Platform } from "@prisma/client";
import { z } from "zod";
import { BrandContext, MOCK_BRAND_CONTEXT } from "@/types/brand-brain";

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
    formalityLevel: z.union([
      z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)
    ]).optional(),
  }).optional(),
  goals: z.array(z.object({
    id: z.string(),
    description: z.string(),
    platforms: z.array(z.nativeEnum(Platform)),
    priority: z.union([
      z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)
    ]),
    keywords: z.array(z.string()),
  })).optional(),
}).optional();

const generateSchema = z.object({
  action: z.literal("generate"),
  idea: z.string().min(1, "Idea is required"),
  platforms: z.array(z.nativeEnum(Platform)).min(1, "At least one platform required"),
  tone: z.string().optional(),
  additionalContext: z.string().optional(),
  brandContext: brandContextSchema,
  forceMock: z.boolean().optional(),
});

const improveSchema = z.object({
  action: z.literal("improve"),
  content: z.string().min(1, "Content is required"),
  platform: z.nativeEnum(Platform),
  instruction: z.string().min(1, "Instruction is required"),
  forceMock: z.boolean().optional(),
});

type RequestBody = 
  | z.infer<typeof generateSchema>
  | z.infer<typeof improveSchema>
  | { action: "status" };

export interface AIStudioGenerateResponse {
  success: true;
  action: "generate";
  variants: GeneratedVariant[];
  usedMock: boolean;
  brandContextUsed: boolean;
  openAIAvailable: boolean;
}

export interface AIStudioImproveResponse {
  success: true;
  action: "improve";
  content: string;
  usedMock: boolean;
  openAIAvailable: boolean;
}

export interface AIStudioStatusResponse {
  success: true;
  action: "status";
  openAIAvailable: boolean;
  mockBrandContext: BrandContext;
}

export interface AIStudioErrorResponse {
  success: false;
  error: string;
  details?: unknown;
}

export type AIStudioResponse = 
  | AIStudioGenerateResponse
  | AIStudioImproveResponse
  | AIStudioStatusResponse
  | AIStudioErrorResponse;

/**
 * AI Studio API - P2 Intelligence feature
 * 
 * Actions:
 * - generate: Transform one idea into per-platform variants
 * - improve: Refine existing content with instructions
 * - status: Check OpenAI availability and get mock brand context
 * 
 * Mock-safe: Works without OpenAI key using deterministic mock generation.
 */
export async function POST(req: NextRequest): Promise<NextResponse<AIStudioResponse>> {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json() as RequestBody;
    const action = body.action;

    if (action === "status") {
      return NextResponse.json({
        success: true,
        action: "status",
        openAIAvailable: isOpenAIAvailable(),
        mockBrandContext: MOCK_BRAND_CONTEXT,
      });
    }

    if (action === "generate") {
      const validation = generateSchema.safeParse(body);
      if (!validation.success) {
        return NextResponse.json(
          { 
            success: false, 
            error: "Invalid request", 
            details: validation.error.issues 
          },
          { status: 400 }
        );
      }

      const { idea, platforms, tone, additionalContext, brandContext, forceMock } = validation.data;

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
        action: "generate",
        variants: result.variants,
        usedMock: result.usedMock,
        brandContextUsed: result.brandContextUsed,
        openAIAvailable: isOpenAIAvailable(),
      });
    }

    if (action === "improve") {
      const validation = improveSchema.safeParse(body);
      if (!validation.success) {
        return NextResponse.json(
          { 
            success: false, 
            error: "Invalid request", 
            details: validation.error.issues 
          },
          { status: 400 }
        );
      }

      const { content, platform, instruction, forceMock } = validation.data;
      const result = await improveContent(content, platform, instruction, forceMock);

      return NextResponse.json({
        success: true,
        action: "improve",
        content: result.content,
        usedMock: result.isMock,
        openAIAvailable: isOpenAIAvailable(),
      });
    }

    return NextResponse.json(
      { 
        success: false, 
        error: "Invalid action. Use 'generate', 'improve', or 'status'" 
      },
      { status: 400 }
    );
  } catch (error) {
    // Not configured is a deployment fact, not a server fault: 503 with a code
    // the UI can act on, rather than a 500 that reads like a crash.
    if (error instanceof AINotConfiguredError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: 503 }
      );
    }
    console.error("AI Studio API error:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to process request" 
      },
      { status: 500 }
    );
  }
}

export async function GET(_req: NextRequest): Promise<NextResponse<AIStudioStatusResponse | AIStudioErrorResponse>> {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      action: "status",
      openAIAvailable: isOpenAIAvailable(),
      /** False in production without a key: generation will refuse, not fake it. */
      mockAIAllowed: isMockAIAllowed(),
      mockBrandContext: MOCK_BRAND_CONTEXT,
    });
  } catch (error) {
    console.error("AI Studio status error:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to get status" 
      },
      { status: 500 }
    );
  }
}
