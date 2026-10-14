import { NextRequest, NextResponse } from "next/server";
import { Platform } from "@prisma/client";
import { requireWorkspace } from "@/lib/tenancy/guard";
import { getAdapter } from "@/lib/adapters";
import { resolveBrainForWorkspace } from "@/lib/brains";
import { oauthStateSecret } from "@/lib/oauth/state-secret";
import { persistConnectedAccount } from "@/lib/oauth/persist-account";
import { noTargetMessage } from "@/lib/oauth/callback";
import {
  pendingCookieName,
  readPendingConnection,
  type PendingProblem,
} from "@/lib/oauth/pending-connection";

/**
 * The second half of a Facebook / Instagram connect when the grant covers
 * several Pages or Instagram accounts (see src/lib/oauth/pending-connection.ts).
 *
 *   GET    ?platform=FACEBOOK  → the candidates, re-read live from Meta (no tokens)
 *   POST   { platform, targetId } → connect that one, clear the pending grant
 *   DELETE ?platform=FACEBOOK  → abandon the pending grant
 *
 * Every call requires `accounts:connect` — the permission that started the
 * flow — and a pending cookie that verifies for this user and platform.
 */

const SELECTABLE: Platform[] = [Platform.FACEBOOK, Platform.INSTAGRAM];

function parsePlatform(value: unknown): Platform | null {
  const upper = typeof value === "string" ? value.toUpperCase() : "";
  return SELECTABLE.includes(upper as Platform) ? (upper as Platform) : null;
}

function problemResponse(reason: PendingProblem) {
  const message =
    reason === "expired" || reason === "missing"
      ? "This selection has expired. Connect the account again."
      : "This selection does not belong to your session. Connect the account again.";
  return NextResponse.json({ error: message, code: `PENDING_${reason.toUpperCase()}` }, { status: 410 });
}

async function loadPending(
  req: NextRequest,
  platform: Platform,
  guard: { userId: string; workspaceId: string },
) {
  return readPendingConnection(req.cookies.get(pendingCookieName(platform))?.value, {
    userId: guard.userId,
    workspaceId: guard.workspaceId,
    platform,
    secret: oauthStateSecret(),
  });
}

export async function GET(req: NextRequest) {
  const guard = await requireWorkspace("accounts:connect");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const platform = parsePlatform(req.nextUrl.searchParams.get("platform"));
  if (!platform) return NextResponse.json({ error: "Invalid platform" }, { status: 400 });

  const pending = await loadPending(req, platform, guard);
  if (!pending.ok) return problemResponse(pending.reason);

  const adapter = getAdapter(platform);
  if (!adapter.listConnectTargets) {
    return NextResponse.json({ error: "This platform has nothing to choose" }, { status: 400 });
  }

  try {
    const targets = await adapter.listConnectTargets(pending.data.userToken);
    if (targets.length === 0) {
      return NextResponse.json({ error: noTargetMessage(platform) }, { status: 404 });
    }
    return NextResponse.json({ platform, brainId: pending.data.brainId, targets });
  } catch (error) {
    console.error(`${platform} pending targets failed:`, error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: "Could not load your accounts from the platform. Connect again." },
      { status: 502 },
    );
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireWorkspace("accounts:connect");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const body = (await req.json().catch(() => null)) as { platform?: unknown; targetId?: unknown } | null;
  const platform = parsePlatform(body?.platform);
  const targetId = typeof body?.targetId === "string" ? body.targetId.trim() : "";
  if (!platform || !targetId) {
    return NextResponse.json({ error: "platform and targetId are required" }, { status: 400 });
  }

  const pending = await loadPending(req, platform, guard);
  if (!pending.ok) return problemResponse(pending.reason);

  const adapter = getAdapter(platform);
  if (!adapter.connectTarget) {
    return NextResponse.json({ error: "This platform has nothing to choose" }, { status: 400 });
  }

  try {
    // connectTarget re-reads the grant's Pages: a target id the grant does not
    // cover is refused there, whatever the browser sent.
    const { tokens, info } = await adapter.connectTarget(pending.data.userToken, targetId);
    const brain = await resolveBrainForWorkspace(guard, pending.data.brainId);
    const saved = await persistConnectedAccount({
      platform,
      workspaceId: guard.workspaceId,
      userId: guard.userId,
      brainId: brain.id,
      adapter,
      tokens: { ...tokens, scope: tokens.scope ?? pending.data.scope ?? undefined },
      info,
    });
    if (!saved.ok) {
      return NextResponse.json(
        { error: "That account is already connected by another workspace.", code: "ACCOUNT_OWNED_ELSEWHERE" },
        { status: 409 },
      );
    }

    const response = NextResponse.json({ success: true, accountId: saved.accountId, brainId: brain.id });
    response.cookies.delete(pendingCookieName(platform));
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error(`${platform} pending connect failed:`, message);
    const notManaged = /not one this login|not linked to a Facebook Page this login/i.test(message);
    return NextResponse.json(
      { error: notManaged ? message : "Could not connect that account. Connect again." },
      { status: notManaged ? 403 : 502 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const guard = await requireWorkspace("accounts:connect");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const platform = parsePlatform(req.nextUrl.searchParams.get("platform"));
  if (!platform) return NextResponse.json({ error: "Invalid platform" }, { status: 400 });

  const response = NextResponse.json({ success: true });
  response.cookies.delete(pendingCookieName(platform));
  return response;
}

export const dynamic = "force-dynamic";
