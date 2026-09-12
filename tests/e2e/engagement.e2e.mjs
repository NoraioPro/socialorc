/**
 * Engagement E2E — mock adapter only.
 *
 * publish → list comments → reply → react → unreact → delete
 */

const RESULTS = [];

function check(name, ok, detail = "") {
  RESULTS.push({ name, ok, detail });
  const mark = ok ? "PASS" : "FAIL";
  console.log(`  [${mark}] ${name}${detail ? ` — ${detail}` : ""}`);
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function runEngagementE2E({ baseUrl, cronSecret, platform = "FACEBOOK" }) {
  RESULTS.length = 0;
  const jar = new Jar();
  const stamp = Date.now();
  const email = `e2e-eng-${stamp}@example.test`;
  const password = `e2e-pass-${stamp}`;

  console.log(`\nSocialOrc engagement E2E — base ${baseUrl}, platform ${platform}`);

  const reg = await req(jar, `${baseUrl}/api/auth/register`, {
    method: "POST",
    json: { name: "Engagement E2E", email, password },
  });
  check("register", reg.status === 200 && !!reg.body?.id, `status ${reg.status}`);

  const csrf = await req(jar, `${baseUrl}/api/auth/csrf`);
  const form = new URLSearchParams({
    csrfToken: csrf.body?.csrfToken ?? "",
    email,
    password,
    json: "true",
    callbackUrl: baseUrl,
  });
  await req(jar, `${baseUrl}/api/auth/callback/credentials`, {
    method: "POST",
    body: form,
    headers: { "content-type": "application/x-www-form-urlencoded" },
  });

  const connect = await req(jar, `${baseUrl}/api/social/connect?platform=${platform}`);
  if (connect.body?.url) await req(jar, connect.body.url);
  const accounts = await req(jar, `${baseUrl}/api/accounts`);
  const account = (accounts.body?.accounts ?? []).find((a) => a.platform === platform);
  check("mock account connected", !!account?.id, account?.platformUsername ?? "none");

  const caps = await req(jar, `${baseUrl}/api/social/engagement/capabilities`);
  check("capabilities endpoint", caps.status === 200 && Array.isArray(caps.body?.accounts), `status ${caps.status}`);
  const capRow = (caps.body?.accounts ?? []).find((a) => a.accountId === account?.id);
  check(
    "platform reports readComments",
    capRow?.capabilities?.readComments?.available === true,
    JSON.stringify(capRow?.capabilities?.readComments),
  );

  const post = await req(jar, `${baseUrl}/api/posts`, {
    method: "POST",
    json: {
      title: `E2E engagement ${stamp}`,
      content: `Engagement harness ${stamp}`,
      platform,
      socialAccountId: account?.id,
    },
  });
  const postId = post.body?.id;
  check("draft created", post.status === 201 && !!postId, `status ${post.status}`);

  await req(jar, `${baseUrl}/api/posts/${postId}/approve`, {
    method: "POST",
    json: { action: "approve" },
  });

  const dueMs = Date.now() + 5_000;
  await req(jar, `${baseUrl}/api/posts/${postId}/schedule`, {
    method: "POST",
    json: { scheduledFor: new Date(dueMs).toISOString() },
  });

  const waitMs = Math.max(0, dueMs - Date.now()) + 3_000;
  console.log(`  ... waiting ${Math.round(waitMs / 1000)}s for publish`);
  await sleep(waitMs);

  await req(jar, `${baseUrl}/api/cron/publish`, {
    headers: { authorization: `Bearer ${cronSecret}` },
  });

  const published = await req(jar, `${baseUrl}/api/posts/${postId}`);
  const platformPostId = published.body?.platformPostId;
  check(
    "post published with platform id",
    published.body?.status === "PUBLISHED" && !!platformPostId,
    published.body?.status,
  );

  if (!account?.id || !platformPostId) {
    console.log("\nAborting engagement chain: missing account or platformPostId");
    return { ok: false, results: RESULTS };
  }

  const seed = await req(jar, `${baseUrl}/api/social/engagement/comments`, {
    method: "POST",
    json: {
      accountId: account.id,
      platformPostId,
      text: `Seed comment ${stamp}`,
    },
  });
  check("create top-level comment", seed.status === 201 && seed.body?.success, `status ${seed.status}`);

  const list = await req(jar, `${baseUrl}/api/social/engagement/comments?${new URLSearchParams({
    accountId: account.id,
    platformPostId,
  })}`);
  const firstComment = list.body?.items?.[0];
  check(
    "list comments returns thread",
    list.status === 200 && (list.body?.items?.length ?? 0) >= 1,
    `count ${list.body?.items?.length ?? 0}`,
  );

  const reply = await req(jar, `${baseUrl}/api/social/engagement/comments`, {
    method: "POST",
    json: {
      accountId: account.id,
      platformPostId,
      parentCommentId: firstComment?.id,
      text: `Reply ${stamp}`,
    },
  });
  check("reply to comment", reply.status === 201, `status ${reply.status}`);

  const reactPost = await req(jar, `${baseUrl}/api/social/engagement/reactions`, {
    method: "POST",
    json: {
      accountId: account.id,
      targetType: "post",
      targetId: platformPostId,
      kind: "like",
    },
  });
  check("react to post", reactPost.status === 200, `status ${reactPost.status}`);

  const unreactPost = await req(jar, `${baseUrl}/api/social/engagement/reactions`, {
    method: "POST",
    json: {
      accountId: account.id,
      targetType: "post",
      targetId: platformPostId,
      kind: "like",
      remove: true,
    },
  });
  check("unreact post", unreactPost.status === 200, `status ${unreactPost.status}`);

  if (firstComment?.id) {
    const reactComment = await req(jar, `${baseUrl}/api/social/engagement/reactions`, {
      method: "POST",
      json: {
        accountId: account.id,
        targetType: "comment",
        targetId: firstComment.id,
        kind: "like",
        platformPostId,
      },
    });
    check("react to comment", reactComment.status === 200, `status ${reactComment.status}`);

    const unreactComment = await req(jar, `${baseUrl}/api/social/engagement/reactions`, {
      method: "POST",
      json: {
        accountId: account.id,
        targetType: "comment",
        targetId: firstComment.id,
        kind: "like",
        remove: true,
        platformPostId,
      },
    });
    check("unreact comment", unreactComment.status === 200, `status ${unreactComment.status}`);

    const del = await req(jar, `${baseUrl}/api/social/engagement/comments`, {
      method: "DELETE",
      json: { accountId: account.id, commentId: firstComment.id },
    });
    check("delete comment", del.status === 200, `status ${del.status}`);
  }

  const connectLi = await req(jar, `${baseUrl}/api/social/connect?platform=LINKEDIN`);
  if (connectLi.body?.url) await req(jar, connectLi.body.url);
  const accountsAfter = await req(jar, `${baseUrl}/api/accounts`);
  const linkedInAccount = (accountsAfter.body?.accounts ?? []).find((a) => a.platform === "LINKEDIN");
  if (linkedInAccount?.id) {
    const blocked = await req(
      jar,
      `${baseUrl}/api/social/engagement/comments?${new URLSearchParams({
        accountId: linkedInAccount.id,
        platformPostId: "any_post",
      })}`,
    );
    check(
      "LinkedIn list comments returns 501",
      blocked.status === 501 && blocked.body?.code === "ENGAGEMENT_NOT_SUPPORTED",
      `status ${blocked.status}`,
    );
  } else {
    check("LinkedIn account for 501 probe", false, "not connected");
  }

  const failed = RESULTS.filter((r) => !r.ok);
  console.log(`\n${RESULTS.length - failed.length}/${RESULTS.length} engagement checks passed`);
  return { ok: failed.length === 0, results: RESULTS };
}
