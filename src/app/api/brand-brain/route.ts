import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import * as z from "zod";
import { Prisma } from "@prisma/client";

const brandBrainSchema = z.object({
  brandName: z.string().optional().nullable(),
  industry: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  targetAudience: z.string().optional().nullable(),
  uniqueValue: z.string().optional().nullable(),
  tone: z.string().optional().nullable(),
  personality: z.string().optional().nullable(),
  writingStyle: z.string().optional().nullable(),
  avoidTopics: z.string().optional().nullable(),
  keyPhrases: z.string().optional().nullable(),
  primaryGoal: z.string().optional().nullable(),
  contentPillars: z.string().optional().nullable(),
  callToAction: z.string().optional().nullable(),
  hashtagStrategy: z.string().optional().nullable(),
  platformOverrides: z.record(z.string(), z.unknown()).optional().nullable(),
});

type BrandBrainInput = z.infer<typeof brandBrainSchema>;

function prepareBrandBrainData(
  data: BrandBrainInput,
  userId: string
): Prisma.BrandBrainUncheckedCreateInput {
  let platformOverridesValue: Prisma.InputJsonValue | typeof Prisma.JsonNull = Prisma.JsonNull;
  if (data.platformOverrides && typeof data.platformOverrides === "object") {
    platformOverridesValue = data.platformOverrides as Prisma.InputJsonValue;
  }

  return {
    userId,
    brandName: data.brandName ?? null,
    industry: data.industry ?? null,
    description: data.description ?? null,
    targetAudience: data.targetAudience ?? null,
    uniqueValue: data.uniqueValue ?? null,
    tone: data.tone ?? null,
    personality: data.personality ?? null,
    writingStyle: data.writingStyle ?? null,
    avoidTopics: data.avoidTopics ?? null,
    keyPhrases: data.keyPhrases ?? null,
    primaryGoal: data.primaryGoal ?? null,
    contentPillars: data.contentPillars ?? null,
    callToAction: data.callToAction ?? null,
    hashtagStrategy: data.hashtagStrategy ?? null,
    platformOverrides: platformOverridesValue,
  };
}

export async function GET() {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const brandBrain = await prisma.brandBrain.findUnique({
      where: { userId: session.user.id },
    });

    return NextResponse.json({
      brandBrain: brandBrain || null,
    });
  } catch (error) {
    console.error("Error fetching brand brain:", error);
    return NextResponse.json(
      { error: "Failed to fetch brand brain" },
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

    const body = await req.json();
    const validation = brandBrainSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid request", details: validation.error.issues },
        { status: 400 }
      );
    }

    const existing = await prisma.brandBrain.findUnique({
      where: { userId: session.user.id },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Brand brain already exists. Use PUT to update." },
        { status: 409 }
      );
    }

    const createData = prepareBrandBrainData(validation.data, session.user.id);
    
    const brandBrain = await prisma.brandBrain.create({
      data: createData,
    });

    return NextResponse.json({
      success: true,
      message: "Brand brain created successfully",
      brandBrain,
    });
  } catch (error) {
    console.error("Error creating brand brain:", error);
    return NextResponse.json(
      { error: "Failed to create brand brain" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const validation = brandBrainSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid request", details: validation.error.issues },
        { status: 400 }
      );
    }

    const preparedData = prepareBrandBrainData(validation.data, session.user.id);

    const brandBrain = await prisma.brandBrain.upsert({
      where: { userId: session.user.id },
      create: preparedData,
      update: {
        brandName: preparedData.brandName,
        industry: preparedData.industry,
        description: preparedData.description,
        targetAudience: preparedData.targetAudience,
        uniqueValue: preparedData.uniqueValue,
        tone: preparedData.tone,
        personality: preparedData.personality,
        writingStyle: preparedData.writingStyle,
        avoidTopics: preparedData.avoidTopics,
        keyPhrases: preparedData.keyPhrases,
        primaryGoal: preparedData.primaryGoal,
        contentPillars: preparedData.contentPillars,
        callToAction: preparedData.callToAction,
        hashtagStrategy: preparedData.hashtagStrategy,
        platformOverrides: preparedData.platformOverrides,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Brand brain saved successfully",
      brandBrain,
    });
  } catch (error) {
    console.error("Error updating brand brain:", error);
    return NextResponse.json(
      { error: "Failed to update brand brain" },
      { status: 500 }
    );
  }
}
