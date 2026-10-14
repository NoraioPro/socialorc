/**
 * SocialOrc workspace isolation suite — permanent, real HTTP against a real database.
 *
 * Workspaces are the isolation boundary (docs/SAAS-PLAN.md). This proves it from
 * the outside, with two workspaces:
 *
 *   - every cross-tenant read, write and delete on posts, media, accounts,
 *     scheduled jobs (through the schedule/unschedule/reschedule/retry/publish
 *     routes), brains, members and the feed is a 404 — never a 403 that would
 *     confirm the id exists, and never a success;
 *   - nothing the attacker tried changed the victim's rows;
 *   - inside one workspace teammates DO share: an invited MANAGER sees an
 *     invited EDITOR's pending post and approves it; teammates react and
 *     comment on each other's posts in the feed;
 *   - a role change takes effect on the member's very next request.
 *
 * Runs inside tests/e2e/run.mjs (signups open, SIGNUP_ROLE=ADMIN, mock adapters),
 * where every non-invited signup starts and owns its own workspace.
 */

const RESULTS = [];

function check(name, ok, detail = "") {
  RESULTS.push({ name, ok, detail });
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
  return ok;
}

class Jar {
  constructor() {
    this.cookies = new Map();
  }
  absorb(res) {
    const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const line of raw) {
      const [pair] = line.split(";");
      const idx = pair.indexOf("=");
      if (idx > 0) this.cookies.set(pair.slice(0, idx).trim(), pair.slice(idx + 1));
    }
  }
  header() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

async function req(jar, url, { method = "GET", body, json, headers = {}, redirect = "manual" } = {}) {
  const h = { ...headers };
  const cookie = jar.header();
  if (cookie) h.cookie = cookie;
  let payload = body;
  if (json !== undefined) {
    h["content-type"] = "application/json";
    payload = JSON.stringify(json);
  }
  const res = await fetch(url, { method, headers: h, body: payload, redirect });
  jar.absorb(res);
  const text = await res.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* non-JSON */
  }
  return { status: res.status, body: parsed, text, location: res.headers.get("location") };
}

export async function runTenancyE2E({ baseUrl }) {
  RESULTS.length = 0;
  const stamp = Date.now();
  const password = `tenancy-pass-${stamp}`;
  const url = (path) => `${baseUrl}${path}`;

  let ipSeq = 0;
  async function signUp(label, extra = {}) {
    const jar = new Jar();
    const email = `tenancy-${label}-${stamp}@example.test`;
    const reg = await req(jar, url("/api/auth/register"), {
      method: "POST",
      json: { name: `Tenancy ${label}`, email, password, ...extra },
      // Register is rate limited per IP and every suite in the run signs up.
      headers: { "x-forwarded-for": `10.81.${Math.floor(stamp / 1000) % 250}.${++ipSeq}` },
    });
    const csrf = await req(jar, url("/api/auth/csrf"));
    await req(jar, url("/api/auth/callback/credentials"), {
      method: "POST",
      body: new URLSearchParams({
        csrfToken: csrf.body?.csrfToken ?? "",
        email,
        password,
        json: "true",
        callbackUrl: baseUrl,
      }),
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
    const session = await req(jar, url("/api/auth/session"));
    return { jar, email, reg, id: session.body?.user?.id ?? null };
  }

  console.log(`\nSocialOrc workspace isolation E2E — ${baseUrl}`);

  // ------------------------------------------------------------ workspace 1
  const owner = await signUp("owner");
  check("workspace 1 owner signs up and signs in", owner.reg.status === 200 && !!owner.id, `status ${owner.reg.status}`);

  const connect = await req(owner.jar, url("/api/social/connect?platform=LINKEDIN"));
  if (connect.body?.url) await req(owner.jar, connect.body.url);
  const ownerAccounts = await req(owner.jar, url("/api/accounts"));
  const account = (ownerAccounts.body?.accounts ?? []).find((a) => a.platform === "LINKEDIN");
  const brainId = ownerAccounts.body?.brain?.id ?? null;
  check("workspace 1 connects a mock account", !!account?.id, account?.platformUsername ?? "none");

  const form = new FormData();
  form.append("file", new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: "image/png" }), "pixel.png");
  const upload = await req(owner.jar, url("/api/media"), { method: "POST", body: form });
  const assetId = upload.body?.id ?? null;
  check("workspace 1 uploads a media asset", upload.status === 201 && !!assetId, `status ${upload.status}`);

  const created = await req(owner.jar, url("/api/posts"), {
    method: "POST",
    json: {
      title: `Tenancy victim ${stamp}`,
      content: "Workspace 1 content nobody else may touch.",
      platform: "LINKEDIN",
      socialAccountId: account?.id,
      mediaAssetIds: assetId ? [assetId] : [],
    },
  });
  const postId = created.body?.id ?? null;
  await req(owner.jar, url(`/api/posts/${postId}/approve`), { method: "POST", json: { action: "approve" } });
  const scheduled = await req(owner.jar, url(`/api/posts/${postId}/schedule`), {
    method: "POST",
    json: { scheduledFor: new Date(Date.now() + 3_600_000).toISOString() },
  });
  check(
    "workspace 1 has a scheduled post with a job",
    scheduled.status === 200 && scheduled.body?.post?.status === "SCHEDULED",
    `status ${scheduled.status}`,
  );

  // ------------------------------------------------------------ workspace 2
  const intruder = await signUp("intruder");
  check("workspace 2 admin signs up in a workspace of its own", intruder.reg.status === 200 && !!intruder.id);
  const j = intruder.jar;

  // Posts
  const notFound = async (name, res) => check(name, res.status === 404, `status ${res.status}`);
  await notFound("cross-tenant GET post is 404", await req(j, url(`/api/posts/${postId}`)));
  await notFound(
    "cross-tenant PATCH post is 404",
    await req(j, url(`/api/posts/${postId}`), { method: "PATCH", json: { content: "hijacked" } }),
  );
  await notFound("cross-tenant DELETE post is 404", await req(j, url(`/api/posts/${postId}`), { method: "DELETE" }));
  await notFound(
    "cross-tenant reject is 404",
    await req(j, url(`/api/posts/${postId}/approve`), { method: "POST", json: { action: "reject", reason: "x" } }),
  );
  await notFound(
    "cross-tenant submit is 404",
    await req(j, url(`/api/posts/${postId}/approve`), { method: "POST", json: { action: "submit" } }),
  );
  await notFound("cross-tenant cascade lookup is 404", await req(j, url(`/api/posts/${postId}/cascade`)));

  // Scheduled jobs (reachable only through their post)
  await notFound(
    "cross-tenant schedule is 404",
    await req(j, url(`/api/posts/${postId}/schedule`), {
      method: "POST",
      json: { scheduledFor: new Date(Date.now() + 7_200_000).toISOString() },
    }),
  );
  await notFound(
    "cross-tenant unschedule (job delete) is 404",
    await req(j, url(`/api/posts/${postId}/schedule`), { method: "DELETE" }),
  );
  await notFound(
    "cross-tenant reschedule (job write) is 404",
    await req(j, url(`/api/posts/${postId}/reschedule`), {
      method: "PATCH",
      json: { scheduledFor: new Date(Date.now() + 7_200_000).toISOString() },
    }),
  );
  await notFound("cross-tenant retry is 404", await req(j, url(`/api/posts/${postId}/retry`), { method: "POST", json: {} }));
  await notFound("cross-tenant publish-now is 404", await req(j, url(`/api/posts/${postId}/publish`), { method: "POST" }));

  const intruderPosts = await req(j, url("/api/posts?limit=100"));
  check(
    "cross-tenant post list does not include the post",
    intruderPosts.status === 200 && !(intruderPosts.body?.posts ?? []).some((p) => p.id === postId),
    `${intruderPosts.body?.posts?.length ?? 0} posts visible`,
  );

  // Media
  const intruderMedia = await req(j, url("/api/media"));
  check(
    "cross-tenant media list does not include the asset",
    intruderMedia.status === 200 && !(intruderMedia.body?.assets ?? []).some((a) => a.id === assetId),
  );
  await notFound("cross-tenant media DELETE is 404", await req(j, url(`/api/media?id=${assetId}`), { method: "DELETE" }));
  await notFound(
    "attaching another workspace's media to a post is 404",
    await req(j, url("/api/posts"), {
      method: "POST",
      json: { content: "steal media", platform: "LINKEDIN", mediaAssetIds: [assetId] },
    }),
  );

  // Accounts
  const intruderAccounts = await req(j, url("/api/accounts"));
  check(
    "cross-tenant account list does not include the account",
    intruderAccounts.status === 200 && !(intruderAccounts.body?.accounts ?? []).some((a) => a.id === account?.id),
  );
  await notFound(
    "cross-tenant account disconnect is 404",
    await req(j, url(`/api/accounts?id=${account?.id}`), { method: "DELETE" }),
  );
  await notFound(
    "pointing a post at another workspace's account is 404",
    await req(j, url("/api/posts"), {
      method: "POST",
      json: { content: "publish through them", platform: "LINKEDIN", socialAccountId: account?.id },
    }),
  );
  await notFound(
    "cross-tenant engagement through the account is 404",
    await req(j, url(`/api/social/engagement/comments?accountId=${account?.id}&platformPostId=x`)),
  );

  // Brains and members
  await notFound(
    "cross-tenant brain rename is 404",
    await req(j, url(`/api/brains/${brainId}`), { method: "PATCH", json: { name: "hijacked" } }),
  );
  await notFound("cross-tenant brain delete is 404", await req(j, url(`/api/brains/${brainId}`), { method: "DELETE" }));
  await notFound(
    "cross-tenant member role change is 404",
    await req(j, url(`/api/workspace/users/${owner.id}`), { method: "PATCH", json: { role: "CLIENT" } }),
  );
  const intruderMembers = await req(j, url("/api/workspace/users"));
  check(
    "the member list holds only the caller's workspace",
    intruderMembers.status === 200 && !(intruderMembers.body?.users ?? []).some((u) => u.id === owner.id),
    `${intruderMembers.body?.users?.length ?? 0} members`,
  );

  // Feed
  const intruderFeed = await req(j, url("/api/feed?limit=50"));
  check(
    "cross-tenant feed does not include the post",
    intruderFeed.status === 200 && !(intruderFeed.body?.posts ?? []).some((p) => p.id === postId),
  );
  await notFound(
    "cross-tenant feed reaction is 404",
    await req(j, url("/api/feed/reactions"), { method: "POST", json: { postId, type: "LIKE" } }),
  );
  await notFound(
    "cross-tenant feed comment is 404",
    await req(j, url("/api/feed/comments"), { method: "POST", json: { postId, content: "hello" } }),
  );

  // Nothing the intruder tried changed workspace 1.
  const after = await req(owner.jar, url(`/api/posts/${postId}`));
  check(
    "the victim's post is untouched (content, status, media, account)",
    after.status === 200 &&
      after.body?.status === "SCHEDULED" &&
      after.body?.content === "Workspace 1 content nobody else may touch." &&
      (after.body?.mediaAssets ?? []).some((m) => m.mediaAssetId === assetId) &&
      after.body?.socialAccountId === account?.id,
    `status ${after.status}/${after.body?.status}`,
  );
  const ownerMedia = await req(owner.jar, url("/api/media"));
  check("the victim's media still exists", (ownerMedia.body?.assets ?? []).some((a) => a.id === assetId));
  const ownerAccountsAfter = await req(owner.jar, url("/api/accounts"));
  check(
    "the victim's account and brain still exist",
    (ownerAccountsAfter.body?.accounts ?? []).some((a) => a.id === account?.id) &&
      ownerAccountsAfter.body?.brain?.id === brainId &&
      ownerAccountsAfter.body?.brain?.name !== "hijacked",
  );

  // ------------------------------------------------- teammates share a workspace
  const invite = async (role) => {
    const res = await req(owner.jar, url("/api/workspace/invitations"), {
      method: "POST",
      json: { email: `tenancy-${role.toLowerCase()}-${stamp}@example.test`, role },
    });
    return res.body?.token ?? "";
  };
  const editor = await signUp("editor", { inviteToken: await invite("EDITOR") });
  const manager = await signUp("manager", { inviteToken: await invite("MANAGER") });
  check(
    "invitees join with the invited roles",
    editor.reg.body?.role === "EDITOR" && manager.reg.body?.role === "MANAGER",
    `${editor.reg.body?.role}/${manager.reg.body?.role}`,
  );

  const draft = await req(editor.jar, url("/api/posts"), {
    method: "POST",
    json: { content: `Editor draft ${stamp}`, platform: "LINKEDIN" },
  });
  const draftId = draft.body?.id ?? null;
  const submitted = await req(editor.jar, url(`/api/posts/${draftId}/approve`), {
    method: "POST",
    json: { action: "submit" },
  });
  check("the EDITOR submits a draft", submitted.status === 200 && submitted.body?.post?.status === "PENDING_APPROVAL");

  const pending = await req(manager.jar, url("/api/posts?status=PENDING_APPROVAL"));
  check(
    "the MANAGER's approvals list shows the EDITOR's pending post",
    (pending.body?.posts ?? []).some((p) => p.id === draftId),
    `${pending.body?.posts?.length ?? 0} pending`,
  );
  const intruderPending = await req(j, url("/api/posts?status=PENDING_APPROVAL"));
  check(
    "another workspace's approvals list does not",
    !(intruderPending.body?.posts ?? []).some((p) => p.id === draftId),
  );
  await notFound(
    "another workspace's admin cannot approve it (404)",
    await req(j, url(`/api/posts/${draftId}/approve`), { method: "POST", json: { action: "approve" } }),
  );

  const approved = await req(manager.jar, url(`/api/posts/${draftId}/approve`), {
    method: "POST",
    json: { action: "approve" },
  });
  check(
    "a same-workspace MANAGER approves the EDITOR's post",
    approved.status === 200 && approved.body?.post?.status === "APPROVED" && approved.body?.post?.approvedBy === manager.id,
    `status ${approved.status}/${approved.body?.post?.status}`,
  );

  const teamFeed = await req(editor.jar, url("/api/feed?limit=50"));
  check(
    "the feed is the workspace timeline: the EDITOR sees the owner's post",
    (teamFeed.body?.posts ?? []).some((p) => p.id === postId) && (teamFeed.body?.posts ?? []).some((p) => p.id === draftId),
  );
  const reacted = await req(editor.jar, url("/api/feed/reactions"), { method: "POST", json: { postId, type: "LIKE" } });
  const commented = await req(manager.jar, url("/api/feed/comments"), {
    method: "POST",
    json: { postId: draftId, content: "Looks good" },
  });
  check(
    "teammates react to and comment on each other's posts",
    reacted.status === 200 && commented.status === 201,
    `${reacted.status}/${commented.status}`,
  );

  const sharedAccounts = await req(manager.jar, url("/api/accounts"));
  check(
    "teammates share the workspace's brain and connected accounts",
    sharedAccounts.body?.brain?.id === brainId && (sharedAccounts.body?.accounts ?? []).some((a) => a.id === account?.id),
  );

  // ---------------------------------------------- role changes bite immediately
  const demote = await req(owner.jar, url(`/api/workspace/users/${manager.id}`), {
    method: "PATCH",
    json: { role: "EDITOR" },
  });
  const second = await req(editor.jar, url("/api/posts"), {
    method: "POST",
    json: { content: `Second draft ${stamp}`, platform: "LINKEDIN" },
  });
  const blocked = await req(manager.jar, url(`/api/posts/${second.body?.id}/approve`), {
    method: "POST",
    json: { action: "approve" },
  });
  check(
    "a demoted member loses approval on the next request, without signing in again",
    demote.status === 200 && blocked.status === 403,
    `demote ${demote.status}, approve ${blocked.status}`,
  );
  const session = await req(manager.jar, url("/api/auth/session"));
  check(
    "the session the UI reads reflects the new role too",
    session.body?.user?.role === "EDITOR" && !(session.body?.user?.permissions ?? []).includes("posts:approve"),
    session.body?.user?.role ?? "none",
  );

  const failed = RESULTS.filter((r) => !r.ok);
  console.log(`\n${RESULTS.length - failed.length}/${RESULTS.length} isolation checks passed`);
  return { ok: failed.length === 0, results: [...RESULTS] };
}
