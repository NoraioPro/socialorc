/**
 * Unified inbox E2E — mock adapters only, real HTTP, real database.
 *
 * The inbox is the Engagement layer fanned out (src/lib/inbox/collect.ts), so
 * this drives it the way a user does: publish a post, get a comment on it
 * (through the engagement API — the mock adapter's comment store stands in for
 * the platform), then
 *
 *   - the comment is listed in GET /api/inbox, unread, with its account and post;
 *   - an account whose platform cannot read comments (LinkedIn) is reported as
 *     unsupported, not silently empty; DMs/mentions are stated as not covered;
 *   - replying from the inbox goes out through the engagement write path and
 *     the item is then replied + read; mark unread / read round-trips;
 *   - a second workspace sees none of it, cannot reply through the first
 *     workspace's account (404), and its read-state writes do not touch the
 *     first workspace's items.
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
  return { status: res.status, body: parsed, text };
}

export async function runInboxE2E({ baseUrl }) {
  RESULTS.length = 0;
  const stamp = Date.now();
  const password = `inbox-pass-${stamp}`;
  const url = (path) => `${baseUrl}${path}`;

  console.log(`\nSocialOrc inbox E2E — base ${baseUrl}`);

  let ipSeq = 0;
  async function signUp(label) {
    const jar = new Jar();
    const email = `inbox-${label}-${stamp}@example.test`;
    const reg = await req(jar, url("/api/auth/register"), {
      method: "POST",
      json: { name: `Inbox ${label}`, email, password },
      // Register is rate limited per IP and every suite in the run signs up.
      headers: { "x-forwarded-for": `10.82.${Math.floor(stamp / 1000) % 250}.${++ipSeq}` },
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
    check(`${label}: signed up`, reg.status === 200, `status ${reg.status}`);
    return jar;
  }

  async function connect(jar, platform) {
    const res = await req(jar, url(`/api/social/connect?platform=${platform}`));
    if (res.body?.url) await req(jar, res.body.url);
    const accounts = await req(jar, url("/api/accounts"));
    return (accounts.body?.accounts ?? []).find((a) => a.platform === platform);
  }

  async function publishedPost(jar, account, label) {
    const created = await req(jar, url("/api/posts"), {
      method: "POST",
      json: {
        title: `Inbox ${label} ${stamp}`,
        content: `Inbox harness ${label} ${stamp}`,
        platform: account.platform,
        socialAccountId: account.id,
      },
    });
    const id = created.body?.id;
    await req(jar, url(`/api/posts/${id}/approve`), { method: "POST", json: { action: "approve" } });
    await req(jar, url(`/api/posts/${id}/publish`), { method: "POST" });
    const post = await req(jar, url(`/api/posts/${id}`));
    return post.body;
  }

  const inbox = async (jar, query = "") => req(jar, url(`/api/inbox${query}`));

  // ── Unauthenticated ──────────────────────────────────────────────────────
  const anon = await inbox(new Jar());
  check("unauthenticated inbox is refused", anon.status === 401, `status ${anon.status}`);

  // ── Workspace A: publish, receive a comment, see it in the inbox ─────────
  const a = await signUp("owner-a");
  const empty = await inbox(a);
  check(
    "A: inbox with no accounts is empty, not an error",
    empty.status === 200 && empty.body?.items?.length === 0 && empty.body?.accounts?.length === 0,
    `status ${empty.status}`,
  );

  const fb = await connect(a, "FACEBOOK");
  const li = await connect(a, "LINKEDIN");
  check("A: mock Facebook + LinkedIn connected", !!fb?.id && !!li?.id);
  if (!fb?.id) return { ok: false, results: RESULTS };

  const post = await publishedPost(a, fb, "a");
  check(
    "A: post published with a platform id",
    post?.status === "PUBLISHED" && !!post?.platformPostId,
    post?.status,
  );
  if (!post?.platformPostId) return { ok: false, results: RESULTS };

  const commentText = `Inbox comment ${stamp}`;
  const seeded = await req(a, url("/api/social/engagement/comments"), {
    method: "POST",
    json: { accountId: fb.id, platformPostId: post.platformPostId, text: commentText },
  });
  check("A: comment arrives on the post (engagement API)", seeded.status === 201, `status ${seeded.status}`);

  const listed = await inbox(a);
  const item = (listed.body?.items ?? []).find((i) => i.content === commentText);
  check("A: GET /api/inbox answers 200", listed.status === 200, `status ${listed.status}`);
  check(
    "A: the comment is in the inbox, unread, tied to its account and post",
    !!item &&
      item.isRead === false &&
      item.isReplied === false &&
      item.accountId === fb.id &&
      item.post?.id === post.id &&
      item.post?.platformPostId === post.platformPostId &&
      item.type === "comment" &&
      item.canReply === true,
    JSON.stringify(item ?? null).slice(0, 200),
  );
  const fbStatus = (listed.body?.accounts ?? []).find((s) => s.accountId === fb.id);
  const liStatus = (listed.body?.accounts ?? []).find((s) => s.accountId === li?.id);
  check("A: Facebook account read ok", fbStatus?.state === "ok" && fbStatus?.postsChecked >= 1, fbStatus?.state);
  check(
    "A: LinkedIn reported as unsupported with a reason",
    liStatus?.state === "unsupported" && typeof liStatus?.message === "string",
    liStatus?.state,
  );
  check(
    "A: coverage says DMs are not covered",
    (listed.body?.coverage?.notCovered ?? []).some((s) => /direct message/i.test(s)),
    JSON.stringify(listed.body?.coverage?.notCovered),
  );
  if (!item) return { ok: false, results: RESULTS };

  // ── Reply from the inbox ─────────────────────────────────────────────────
  const invalid = await req(a, url("/api/inbox"), {
    method: "PATCH",
    json: { action: "reply", platform: "FACEBOOK", commentId: item.commentId },
  });
  check("A: malformed reply is a 400", invalid.status === 400, `status ${invalid.status}`);

  const replyText = `Inbox reply ${stamp}`;
  const replied = await req(a, url("/api/inbox"), {
    method: "PATCH",
    json: {
      action: "reply",
      platform: item.platform,
      commentId: item.commentId,
      accountId: item.accountId,
      platformPostId: item.post.platformPostId,
      content: replyText,
    },
  });
  check("A: reply from the inbox is sent", replied.status === 201 && !!replied.body?.commentId, `status ${replied.status}`);

  const afterReply = await inbox(a);
  const original = (afterReply.body?.items ?? []).find((i) => i.commentId === item.commentId);
  const replyItem = (afterReply.body?.items ?? []).find((i) => i.content === replyText);
  check(
    "A: replied item is marked replied and read",
    original?.isReplied === true && original?.isRead === true,
    JSON.stringify({ isReplied: original?.isReplied, isRead: original?.isRead }),
  );
  check(
    "A: the reply reached the platform thread",
    replyItem?.type === "reply" && replyItem?.parentCommentId === item.commentId,
    replyItem?.type ?? "missing",
  );

  const unread = await req(a, url("/api/inbox"), {
    method: "PATCH",
    json: { action: "markUnread", platform: item.platform, commentId: item.commentId },
  });
  const afterUnread = await inbox(a, "?unreadOnly=true");
  check(
    "A: mark unread round-trips",
    unread.status === 200 &&
      (afterUnread.body?.items ?? []).some((i) => i.commentId === item.commentId),
    `status ${unread.status}`,
  );
  if (replyItem) {
    await req(a, url("/api/inbox"), {
      method: "PATCH",
      json: { action: "markRead", platform: replyItem.platform, commentId: replyItem.commentId },
    });
  }

  // ── Workspace B: isolated ────────────────────────────────────────────────
  const b = await signUp("owner-b");
  const bEmpty = await inbox(b);
  check(
    "B: sees nothing of A's inbox",
    bEmpty.status === 200 && (bEmpty.body?.items ?? []).length === 0 && (bEmpty.body?.accounts ?? []).length === 0,
    `items ${bEmpty.body?.items?.length}`,
  );

  const bFb = await connect(b, "FACEBOOK");
  const bWithAccount = await inbox(b);
  check(
    "B: own account listed, still none of A's comments",
    (bWithAccount.body?.accounts ?? []).every((s) => s.accountId === bFb?.id) &&
      !(bWithAccount.body?.items ?? []).some((i) => i.accountId === fb.id || i.post?.id === post.id),
    `accounts ${bWithAccount.body?.accounts?.length}`,
  );

  const bReply = await req(b, url("/api/inbox"), {
    method: "PATCH",
    json: {
      action: "reply",
      platform: "FACEBOOK",
      commentId: item.commentId,
      accountId: fb.id,
      platformPostId: post.platformPostId,
      content: "cross-tenant reply",
    },
  });
  check("B: replying through A's account is a 404", bReply.status === 404, `status ${bReply.status}`);

  const bMark = await req(b, url("/api/inbox"), {
    method: "PATCH",
    json: { action: "markRead", platform: "FACEBOOK", commentId: item.commentId },
  });
  const aAfterB = await inbox(a);
  const aItem = (aAfterB.body?.items ?? []).find((i) => i.commentId === item.commentId);
  check(
    "B: its read-state write does not touch A's item",
    bMark.status === 200 && aItem?.isRead === false,
    `B status ${bMark.status}, A isRead ${aItem?.isRead}`,
  );
  check(
    "A: B's reply attempt never reached A's thread",
    !(aAfterB.body?.items ?? []).some((i) => i.content === "cross-tenant reply"),
  );

  const failed = RESULTS.filter((r) => !r.ok);
  console.log(`\n${RESULTS.length - failed.length}/${RESULTS.length} inbox checks passed`);
  return { ok: failed.length === 0, results: RESULTS };
}
