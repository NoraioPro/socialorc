import type { PrismaClient } from "@prisma/client";

/**
 * Tenant stamping, at the client layer.
 *
 * `docs/SAAS-PLAN.md` Phase 0.3. The plan's writers step is "stamp `workspaceId`
 * on every new row", and there are ~70 `create`/`upsert` call sites across
 * `Post`, `MediaAsset`, `SocialAccount`, `Brain` and `ScheduledJob`. Editing them
 * one by one guarantees that the one somebody adds next month is the one that
 * forgets, and a forgotten tenant is exactly the row the NOT NULL migration
 * (Phase 0.5) then fails on — on every build, hotfixes included.
 *
 * So the stamp lives here instead: one `create` hook that fills `workspaceId`
 * from the row's own `userId` whenever the caller did not set it. A new call
 * site is correct without knowing this exists.
 *
 * Three deliberate properties:
 *
 *  - **It never overwrites.** An explicit `workspaceId` wins, so a caller that
 *    knows its tenant (the backfill, an admin path, a future cross-workspace
 *    copy) is not second-guessed.
 *  - **It never invents a workspace.** Resolution only — a user with no
 *    membership yields `null` and the row is left unstamped, to be fixed by
 *    `scripts/backfill-workspaces.ts`. Conjuring one here would create a
 *    *personal* workspace per user and fragment the deployment (see
 *    `workspace.ts`, which is the authority on this rule).
 *  - **It fails soft.** A resolution error must not break a write that would
 *    otherwise have succeeded, because nothing filters on the tenant yet. It
 *    logs and leaves the row unstamped. Phase 0.5's NOT NULL is what turns a
 *    missing tenant into a hard failure, deliberately, once every writer is
 *    proven to stamp.
 *
 * `ScheduledJob` carries no `userId` — only a `postId` — so it resolves its
 * tenant through the post. That is why the hook has two paths rather than one,
 * and why the two scheduling routes need no change at all.
 */

/** Models whose rows belong to a workspace. */
const TENANT_MODELS = new Set(["Brain", "Post", "MediaAsset", "SocialAccount", "ScheduledJob"]);

interface CreatableData {
  userId?: unknown;
  workspaceId?: unknown;
}

/**
 * The membership lookup, inlined against the passed client rather than
 * imported: `workspace.ts` imports the app's `prisma` singleton, and that
 * singleton imports this module, so reusing it here would close a cycle.
 */
async function workspaceIdForUser(client: PrismaClient, userId: string): Promise<string | null> {
  const membership = await client.workspaceMember.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { workspaceId: true },
  });
  return membership?.workspaceId ?? null;
}

async function workspaceIdForPost(client: PrismaClient, postId: string): Promise<string | null> {
  const post = await client.post.findUnique({
    where: { id: postId },
    select: { workspaceId: true },
  });
  return post?.workspaceId ?? null;
}

async function stamp(client: PrismaClient, args: { data?: unknown }): Promise<void> {
  const data = args?.data as CreatableData | undefined;
  if (!data || typeof data !== "object") return;

  // An explicit tenant always wins.
  if (data.workspaceId !== undefined && data.workspaceId !== null) return;

  try {
    const userId = data.userId;
    if (typeof userId === "string" && userId !== "") {
      const workspaceId = await workspaceIdForUser(client, userId);
      if (workspaceId) (data as { workspaceId?: string | null }).workspaceId = workspaceId;
      return;
    }

    // `ScheduledJob` has no owner column of its own; its post is the authority.
    const postId = (data as { postId?: unknown }).postId;
    if (typeof postId === "string" && postId !== "") {
      const workspaceId = await workspaceIdForPost(client, postId);
      if (workspaceId) (data as { workspaceId?: string | null }).workspaceId = workspaceId;
    }
  } catch (error) {
    console.error("[tenancy] could not stamp a workspace on create", error);
  }
}

/**
 * Wrap a client so creates on the tenant models carry a workspace.
 *
 * The returned type is declared as the input type: the extension changes
 * behaviour, not the query API, and widening it here would ripple into every
 * call site for no benefit.
 */
export function withTenantStamping<T extends PrismaClient>(client: T): T {
  const extended = client.$extends({
    name: "tenant-stamping",
    query: {
      $allModels: {
        async create({ model, args, query }) {
          if (TENANT_MODELS.has(model)) await stamp(client, args as { data?: unknown });
          return query(args);
        },
        async upsert({ model, args, query }) {
          if (TENANT_MODELS.has(model)) await stamp(client, args as { data?: unknown });
          return query(args);
        },
      },
    },
  });

  return extended as unknown as T;
}
