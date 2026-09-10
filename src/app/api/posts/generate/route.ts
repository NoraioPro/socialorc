import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { generatePlatformVariants, improveContent, suggestBestTimes } from "@/lib/ai";
import { Platform } from "@prisma/client";
import { z } from "zod";

const generateSchema = z.object({
  idea: z.string().min(1),
  platforms: z.array(z.nativeEnum(Platform)).min(1),
  tone: z.string().optional(),
  additionalContext: z.string().optional(),
});

const improveSchema = z.object({
  content: z.string().min(1),
  platform: z.nativeEnum(Platform),
  instruction: z.string().min(1),
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

      const { idea, platforms, tone, additionalContext } = validation.data;

      try {
        const variants = await generatePlatformVariants(
          idea,
          platforms,
          tone,
          additionalContext
        );

        return NextResponse.json({
          success: true,
          variants,
        });
      } catch (error) {
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

      const { content, platform, instruction } = validation.data;

      try {
        const improved = await improveContent(content, platform, instruction);

        return NextResponse.json({
          success: true,
          content: improved,
        });
      } catch (error) {
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
    console.error("Error in generate API:", error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}
