import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { z } from "zod";
import {
  checkEngagementSupported,
  loadOwnedAccount,
  prepareEngagementContext,
  handleEngagementResultFailure,
  parseReactionKind,
} from "@/lib/social/engagement-api";

const reactionSchema = z.object({
  accountId: z.string().min(1),
  targetType: z.enum(["post", "comment"]),
  targetId: z.string().min(1),
  kind: z.string().min(1),
  remove: z.boolean().optional(),
  platformPostId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const guard = await requirePermission("engagement:react");
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = reactionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const { accountId, targetType, targetId, remove, platformPostId } = parsed.data;
  const kind = parseReactionKind(parsed.data.kind);
  if (!kind) {
    return NextResponse.json({ error: "Invalid reaction kind" }, { status: 400 });
  }

  const account = await loadOwnedAccount(guard.userId, accountId);
  if (!account) {
    return NextResponse.json({ error: "Social account not found" }, { status: 404 });
  }

  const prepared = await prepareEngagementContext(account);
  if (!prepared.ok) {
    return NextResponse.json(prepared.body, { status: prepared.status });
  }

  const { ctx } = prepared;
  let operation:
    | "reactToPost"
    | "unreactToPost"
    | "reactToComment"
    | "unreactToComment";

  if (targetType === "post") {
    operation = remove ? "unreactToPost" : "reactToPost";
  } else {
    operation = remove ? "unreactToComment" : "reactToComment";
  }

  const supported = checkEngagementSupported(ctx.adapter, ctx.account.platform, operation);
  if (!supported.ok) {
    return NextResponse.json(supported.body, { status: supported.status });
  }

  let result;
  if (targetType === "post") {
    result = remove
      ? await ctx.adapter.unreactToPost!(ctx.accessToken, {
          platformPostId: targetId,
          kind,
        })
      : await ctx.adapter.reactToPost!(ctx.accessToken, {
          platformPostId: targetId,
          kind,
        });
  } else {
    result = remove
      ? await ctx.adapter.unreactToComment!(ctx.accessToken, {
          commentId: targetId,
          kind,
        })
      : await ctx.adapter.reactToComment!(ctx.accessToken, {
          commentId: targetId,
          kind,
          platformPostId,
        });
  }

  if (!result.success) {
    const failure = await handleEngagementResultFailure(
      ctx.account.id,
      ctx.account.platform,
      result.error,
    );
    const status =
      failure.error.code === "SOCIAL_AUTH_EXPIRED" ||
      failure.error.code === "SOCIAL_REAUTHORIZE_REQUIRED"
        ? 401
        : 400;
    return NextResponse.json(failure, { status });
  }

  return NextResponse.json({ success: true });
}

export const dynamic = "force-dynamic";
