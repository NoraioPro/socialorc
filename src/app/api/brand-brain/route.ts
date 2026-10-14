import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireWorkspace, type TenantContext } from "@/lib/tenancy/guard";
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

/**
 * Write the workspace's brand brain: update the workspace's row, or create it.
 *
 * `BrandBrain.userId` is still unique (rows written before tenancy were one per
 * person), so a member who already holds an old, unstamped row of their own
 * cannot get a second one: that row is claimed for the workspace instead.
 */
async function saveWorkspaceBrandBrain(tenant: TenantContext, input: BrandBrainInput) {
  const data = prepareBrandBrainData(input, tenant.userId);
  const { userId: _creator, ...fields } = data;
  void _creator;

  const current = await prisma.brandBrain.findUnique({
    where: { workspaceId: tenant.workspaceId },
    select: { id: true },
  });
  if (current) {
    // The creator stays the creator; the content is the team's.
    return prisma.brandBrain.update({ where: { id: current.id }, data: fields });
  }

  const ownLegacyRow = await prisma.brandBrain.findFirst({
    where: { workspaceId: null, userId: tenant.userId },
    select: { id: true },
  });
  if (ownLegacyRow) {
    return prisma.brandBrain.update({
      where: { id: ownLegacyRow.id },
      data: { ...fields, workspaceId: tenant.workspaceId },
    });
  }

  return prisma.brandBrain.create({ data: { ...data, workspaceId: tenant.workspaceId } });
}

export async function GET() {
  try {
    // Reading the brand brain is fine for any member; writing it is not.
    const tenant = await requireWorkspace("brains:read");
    if (!tenant.ok) {
      return NextResponse.json({ error: tenant.error }, { status: tenant.status });
    }

    const brandBrain = await prisma.brandBrain.findUnique({
      where: { workspaceId: tenant.workspaceId },
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
    // The brand brain is the workspace's voice; writing it is an admin action.
    const tenant = await requireWorkspace("brains:manage");
    if (!tenant.ok) {
      return NextResponse.json({ error: tenant.error }, { status: tenant.status });
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
      where: { workspaceId: tenant.workspaceId },
      select: { id: true },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Brand brain already exists. Use PUT to update." },
        { status: 409 }
      );
    }

    const brandBrain = await saveWorkspaceBrandBrain(tenant, validation.data);

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
    const tenant = await requireWorkspace("brains:manage");
    if (!tenant.ok) {
      return NextResponse.json({ error: tenant.error }, { status: tenant.status });
    }

    const body = await req.json();
    const validation = brandBrainSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid request", details: validation.error.issues },
        { status: 400 }
      );
    }

    const brandBrain = await saveWorkspaceBrandBrain(tenant, validation.data);

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
