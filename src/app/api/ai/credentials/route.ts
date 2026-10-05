import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthSession, requirePermission } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/encryption";
import { DEFAULT_BASE_URL, keyHint, resolveAiConfig, type AiKind } from "@/lib/ai-config";

/**
 * The one place a person's own AI key is written.
 *
 * Two scopes, and they are not interchangeable:
 *   user      — a person's key. Only its owner may read or write it; no
 *               permission is required because it is nobody else's business.
 *   workspace — the key a team agreed to share. Writing it needs `users:manage`,
 *               the same permission that already guards who may administer the
 *               workspace, and the caller must be a member of that workspace.
 *
 * **The key is write-only.** No response from this route ever contains it, not in
 * a success body, an error message, or a log line. `GET` returns `keyHint`, the
 * last four characters, which is enough for a person to recognise which key is
 * stored and not enough to use it. There is deliberately no "reveal" endpoint.
 *
 * Nothing here can fall back to the deployment's own key either — see
 * src/lib/ai-config.ts. This route only ever stores what a customer typed.
 */

const scopeSchema = z.enum(["user", "workspace"]);
const kindSchema = z.enum(["text", "image"]);

/** Optional string that treats "" as absent, so a form can clear a field. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value === "" ? undefined : value));

const credentialSchema = z.object({
  scope: scopeSchema.default("user"),
  kind: kindSchema.default("text"),
  provider: z.string().trim().min(1).max(40).default("openai"),
  // Too short to be real, and we would rather say so here than store junk and
  // let the provider reject it later with a confusing message.
  apiKey: z.string().trim().min(8, "That does not look like an API key.").max(400),
  baseUrl: optionalText(300),
  model: optionalText(120),
  // Required only for the workspace scope; the user scope ignores it.
  workspaceId: z.string().trim().min(1).optional(),
});

interface Target {
  userId?: string;
  workspaceId?: string;
}

/**
 * Turn a requested scope into the row to touch, or explain why not.
 *
 * The workspace scope is checked twice on purpose: membership of the workspace,
 * then the workspace-admin permission. Membership alone is not enough to decide
 * a policy that spends the whole team's money.
 */
async function resolveTarget(
  scope: "user" | "workspace",
  workspaceId: string | null,
): Promise<{ target?: Target; response?: NextResponse }> {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return {
      response: NextResponse.json(
        { error: "unauthorized", message: "Sign in first." },
        { status: 401 },
      ),
    };
  }

  if (scope === "user") {
    return { target: { userId: session.user.id } };
  }

  if (!workspaceId) {
    return {
      response: NextResponse.json(
        { error: "workspace_required", message: "A workspace scope needs a workspaceId." },
        { status: 400 },
      ),
    };
  }

  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
  });
  if (!member) {
    return {
      response: NextResponse.json(
        { error: "not_a_member", message: "You are not a member of that workspace." },
        { status: 403 },
      ),
    };
  }

  // This helper *returns* its verdict, it does not throw. An await whose result
  // is never inspected would let any member replace the team's key, so the
  // failure is checked explicitly.
  const permission = await requirePermission("users:manage");
  if (!permission.ok) {
    return {
      response: NextResponse.json(
        {
          error: permission.status === 401 ? "unauthorized" : "forbidden",
          message:
            permission.status === 401
              ? "Sign in first."
              : "Only a workspace admin can change the shared AI key.",
        },
        { status: permission.status },
      ),
    };
  }

  return { target: { workspaceId } };
}

/** The stored row for a target, or null. Bypasses the resolver: this is raw storage. */
async function findRow(target: Target, kind: AiKind) {
  if (target.userId) {
    return prisma.aiCredential.findUnique({
      where: { userId_kind: { userId: target.userId, kind } },
    });
  }
  if (target.workspaceId) {
    return prisma.aiCredential.findUnique({
      where: { workspaceId_kind: { workspaceId: target.workspaceId, kind } },
    });
  }
  return null;
}

export async function GET(req: NextRequest) {
  const scope = scopeSchema.catch("user").parse(req.nextUrl.searchParams.get("scope") ?? "user");
  const kind = kindSchema.catch("text").parse(req.nextUrl.searchParams.get("kind") ?? "text");
  const workspaceId = req.nextUrl.searchParams.get("workspaceId");

  const { target, response } = await resolveTarget(scope, workspaceId);
  if (response) return response;

  const row = await findRow(target!, kind);

  // Which key would actually be used for this request: the person's, the team's,
  // or none. Surfaced so the UI can say so plainly instead of leaving people to
  // guess why AI is behaving the way it is.
  const effective =
    scope === "workspace"
      ? await resolveAiConfig({ workspaceId: target!.workspaceId }, kind)
      : await resolveAiConfig({ ...target }, kind);

  return NextResponse.json({
    scope,
    kind,
    workspaceId: target!.workspaceId ?? null,
    configured: Boolean(row),
    provider: row?.provider ?? "openai",
    baseUrl: row?.baseUrl ?? null,
    model: row?.model ?? null,
    // Last four characters only. Never the key itself.
    keyHint: row ? keyHint(decrypt(row.encryptedKey)) : null,
    effectiveSource: effective?.source ?? null,
  });
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = credentialSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid", message: parsed.error.issues[0]?.message ?? "Invalid payload." },
      { status: 400 },
    );
  }

  const { scope, kind, provider, apiKey, baseUrl, model, workspaceId } = parsed.data;

  const { target, response } = await resolveTarget(scope, workspaceId ?? null);
  if (response) return response;

  // Encrypted before it is stored; the plaintext never reaches the database or
  // the response.
  const encryptedKey = encrypt(apiKey);
  // `kind` is deliberately not in here: it is part of the row's identity (see the
  // composite unique index), so it belongs on `create` and must never be
  // rewritten by an update.
  const data = {
    provider,
    encryptedKey,
    baseUrl: baseUrl ?? null,
    model: model ?? null,
  };

  const row = target!.userId
    ? await prisma.aiCredential.upsert({
        where: { userId_kind: { userId: target!.userId, kind } },
        create: { userId: target!.userId, kind, ...data },
        update: data,
      })
    : await prisma.aiCredential.upsert({
        where: { workspaceId_kind: { workspaceId: target!.workspaceId!, kind } },
        create: { workspaceId: target!.workspaceId!, kind, ...data },
        update: data,
      });

  return NextResponse.json({
    scope,
    kind,
    configured: true,
    provider: row.provider,
    baseUrl: row.baseUrl,
    model: row.model,
    keyHint: keyHint(apiKey),
    effectiveSource: scope,
  });
}

export async function DELETE(req: NextRequest) {
  const scope = scopeSchema.catch("user").parse(req.nextUrl.searchParams.get("scope") ?? "user");
  const kind = kindSchema.catch("text").parse(req.nextUrl.searchParams.get("kind") ?? "text");
  const workspaceId = req.nextUrl.searchParams.get("workspaceId");

  const { target, response } = await resolveTarget(scope, workspaceId);
  if (response) return response;

  const row = await findRow(target!, kind);
  if (!row) {
    return NextResponse.json({ scope, kind, configured: false, removed: false });
  }

  await (target!.userId
    ? prisma.aiCredential.delete({ where: { userId_kind: { userId: target!.userId, kind } } })
    : prisma.aiCredential.delete({
        where: { workspaceId_kind: { workspaceId: target!.workspaceId!, kind } },
      }));

  return NextResponse.json({ scope, kind, configured: false, removed: true });
}
