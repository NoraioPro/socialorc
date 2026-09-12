import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { z } from "zod";
import {
  checkEngagementSupported,
  loadOwnedAccount,
  prepareEngagementContext,
  handleEngagementResultFailure,
} from "@/lib/social/engagement-api";

export async function GET(req: NextRequest) {
  const guard = await requirePermission("engagement:view");
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const { searchParams } = req.nextUrl;
  const accountId = searchParams.get("accountId");
  const platformPostId = searchParams.get("platformPostId");
  const cursor = searchParams.get("cursor");
  const limitRaw = searchParams.get("limit");
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;

  if (!accountId || !platformPostId) {
    return NextResponse.json(
      { error: "accountId and platformPostId are required" },
      { status: 400 },
    );
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
  const supported = checkEngagementSupported(ctx.adapter, ctx.account.platform, "listComments");
  if (!supported.ok) {
    return NextResponse.json(supported.body, { status: supported.status });
  }

  const result = await ctx.adapter.listComments!(ctx.accessToken, {
    platformPostId,
    cursor: cursor ?? undefined,
    limit: Number.isFinite(limit) ? limit : undefined,
  });

  if (!result.success) {
    const body = await handleEngagementResultFailure(
      ctx.account.id,
      ctx.account.platform,
      result.error,
    );
    const status =
      body.error.code === "SOCIAL_AUTH_EXPIRED" || body.error.code === "SOCIAL_REAUTHORIZE_REQUIRED"
        ? 401
        : 400;
    return NextResponse.json(body, { status });
  }

  return NextResponse.json({
    items: result.items ?? [],
    nextCursor: result.nextCursor ?? null,
  });
}

const createSchema = z.object({
  accountId: z.string().min(1),
  platformPostId: z.string().min(1),
  text: z.string().min(1),
  parentCommentId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const guard = await requirePermission("engagement:reply");
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const { accountId, platformPostId, text, parentCommentId } = parsed.data;
  const account = await loadOwnedAccount(guard.userId, accountId);
  if (!account) {
    return NextResponse.json({ error: "Social account not found" }, { status: 404 });
  }

  const prepared = await prepareEngagementContext(account);
  if (!prepared.ok) {
    return NextResponse.json(prepared.body, { status: prepared.status });
  }

  const { ctx } = prepared;
  const operation = parentCommentId ? "replyToComment" : "createComment";
  const supported = checkEngagementSupported(ctx.adapter, ctx.account.platform, operation);
  if (!supported.ok) {
    return NextResponse.json(supported.body, { status: supported.status });
  }

  const result = parentCommentId
    ? await ctx.adapter.replyToComment!(ctx.accessToken, {
        commentId: parentCommentId,
        text,
        platformPostId,
      })
    : await ctx.adapter.createComment!(ctx.accessToken, { platformPostId, text });

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

  return NextResponse.json(
    { success: true, commentId: result.commentId },
    { status: 201 },
  );
}

const deleteSchema = z.object({
  accountId: z.string().min(1),
  commentId: z.string().min(1),
});

export async function DELETE(req: NextRequest) {
  const guard = await requirePermission("engagement:delete");
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  let accountId = req.nextUrl.searchParams.get("accountId");
  let commentId = req.nextUrl.searchParams.get("commentId");

  if (!accountId || !commentId) {
    try {
      const body = await req.json();
      const parsed = deleteSchema.safeParse(body);
      if (parsed.success) {
        accountId = parsed.data.accountId;
        commentId = parsed.data.commentId;
      }
    } catch {
      /* query-only delete */
    }
  }

  if (!accountId || !commentId) {
    return NextResponse.json(
      { error: "accountId and commentId are required" },
      { status: 400 },
    );
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
  const supported = checkEngagementSupported(ctx.adapter, ctx.account.platform, "deleteComment");
  if (!supported.ok) {
    return NextResponse.json(supported.body, { status: supported.status });
  }

  const result = await ctx.adapter.deleteComment!(ctx.accessToken, { commentId });
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
