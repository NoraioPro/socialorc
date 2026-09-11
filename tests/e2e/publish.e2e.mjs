/**
 * SocialOrc end-to-end publish test (M0.2) — mock adapter only, no network side effects.
 *
 * Exercises the whole approval-gated chain against a running server:
 *   register -> login -> connect (mock) -> draft -> GATE 400 -> approve -> schedule
 *   -> cron before due (nothing) -> cron after due (published) -> verify PUBLISHED
 *
 * Every assertion is a hard check; the process exits non-zero if any fails.
 * Runs with MOCK_SOCIAL_ADAPTERS="true", so nothing is ever sent to a real platform.
 */

const RESULTS = [];

function check(name, ok, detail = "") {
  RESULTS.push({ name, ok, detail });
  const mark = ok ? "PASS" : "FAIL";
  console.log(`  [${mark}] ${name}${detail ? ` — ${detail}` : ""}`);
  return ok;
}

/** Minimal cookie jar: preserves Set-Cookie across requests like a browser session. */
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
    /* non-JSON body (HTML redirect page, etc.) */
  }
  return { status: res.status, body: parsed, text, location: res.headers.get("location") };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function runPublishE2E({ baseUrl, cronSecret, platform = "LINKEDIN" }) {
  RESULTS.length = 0;
  const jar = new Jar();
  const stamp = Date.now();
  const email = `e2e-${stamp}@example.test`;
  const password = `e2e-pass-${stamp}`;

  console.log(`\nSocialOrc E2E — base ${baseUrl}, platform ${platform}, mock adapters only`);

  // 1. register
  const reg = await req(jar, `${baseUrl}/api/auth/register`, {
    method: "POST",
    json: { name: "E2E Runner", email, password },
  });
  check("register creates a user", reg.status === 200 && !!reg.body?.id, `status ${reg.status}`);

  // 2. credentials login (NextAuth csrf -> callback)
  const csrf = await req(jar, `${baseUrl}/api/auth/csrf`);
  check("csrf token issued", csrf.status === 200 && !!csrf.body?.csrfToken, `status ${csrf.status}`);

  const form = new URLSearchParams({
    csrfToken: csrf.body?.csrfToken ?? "",
    email,
    password,
    json: "true",
    callbackUrl: baseUrl,
  });
  const login = await req(jar, `${baseUrl}/api/auth/callback/credentials`, {
    method: "POST",
    body: form,
    headers: { "content-type": "application/x-www-form-urlencoded" },
  });
  const hasSessionCookie = [...jar.cookies.keys()].some((k) => k.includes("session-token"));
  check("login returns a session cookie", hasSessionCookie, `status ${login.status}`);

  const session = await req(jar, `${baseUrl}/api/auth/session`);
  check("session identifies the user", session.body?.user?.email === email, session.body?.user?.email ?? "no session");

  // 3. connect a platform through the mock callback path
  const connect = await req(jar, `${baseUrl}/api/social/connect?platform=${platform}`);
  const oauthUrl = connect.body?.url;
  check("connect hands back a mock OAuth url", connect.status === 200 && !!oauthUrl, `status ${connect.status}`);

  if (oauthUrl) await req(jar, oauthUrl);
  const accounts = await req(jar, `${baseUrl}/api/accounts`);
  const account = (accounts.body?.accounts ?? []).find((a) => a.platform === platform);
  check(
    `a ${platform} social account is connected (mock)`,
    !!account && String(account.platformUsername ?? "").startsWith("mock_"),
    account?.platformUsername ?? "none",
  );

  // 4. draft the post
  const post = await req(jar, `${baseUrl}/api/posts`, {
    method: "POST",
    json: {
      title: `E2E ${platform} publish ${stamp}`,
      content: `SocialOrc E2E harness ${stamp} — approval-gated publish against the mock adapter.`,
      platform,
      socialAccountId: account?.id,
    },
  });
  const postId = post.body?.id;
  check("draft post created", post.status === 201 && post.body?.status === "DRAFT", `status ${post.status}/${post.body?.status}`);

  if (!postId) {
    console.log("\nAborting: no post id, cannot continue the chain.");
    return { ok: false, results: RESULTS };
  }

  // 5. THE GATE — scheduling an unapproved post must be rejected
  const guard = await req(jar, `${baseUrl}/api/posts/${postId}/schedule`, {
    method: "POST",
    json: { scheduledFor: new Date(Date.now() + 60_000).toISOString() },
  });
  check(
    "GATE: scheduling a DRAFT is rejected with 400",
    guard.status === 400 && /must be approved/i.test(guard.body?.error ?? ""),
    `status ${guard.status} — ${guard.body?.error ?? guard.text.slice(0, 80)}`,
  );

  // 6. approve
  const approve = await req(jar, `${baseUrl}/api/posts/${postId}/approve`, {
    method: "POST",
    json: { action: "approve" },
  });
  check("post approved", approve.status === 200 && approve.body?.post?.status === "APPROVED", `status ${approve.status}`);

  // 7. schedule it 20s out
  const dueMs = Date.now() + 20_000;
  const sched = await req(jar, `${baseUrl}/api/posts/${postId}/schedule`, {
    method: "POST",
    json: { scheduledFor: new Date(dueMs).toISOString() },
  });
  check("approved post scheduled", sched.status === 200 && sched.body?.post?.status === "SCHEDULED", `status ${sched.status}`);

  // 8. cron auth is enforced
  const noAuth = await req(jar, `${baseUrl}/api/cron/publish`);
  check("cron without bearer token is 401", noAuth.status === 401, `status ${noAuth.status}`);
  const badAuth = await req(jar, `${baseUrl}/api/cron/publish`, { headers: { authorization: "Bearer wrong-secret" } });
  check("cron with wrong bearer token is 401", badAuth.status === 401, `status ${badAuth.status}`);

  // 9. cron before the due time must publish nothing
  const early = await req(jar, `${baseUrl}/api/cron/publish`, { headers: { authorization: `Bearer ${cronSecret}` } });
  check(
    "cron before due time publishes nothing",
    early.status === 200 && early.body?.processed === 0 && early.body?.published === 0,
    `processed ${early.body?.processed}, published ${early.body?.published}`,
  );

  // 10. wait, then cron after the due time must publish exactly once
  const waitMs = Math.max(0, dueMs - Date.now()) + 4_000;
  console.log(`  ... waiting ${Math.round(waitMs / 1000)}s for the scheduled time`);
  await sleep(waitMs);

  const late = await req(jar, `${baseUrl}/api/cron/publish`, { headers: { authorization: `Bearer ${cronSecret}` } });
  check(
    "cron after due time published exactly one post",
    late.status === 200 && late.body?.processed === 1 && late.body?.published === 1 && late.body?.failed === 0,
    `processed ${late.body?.processed}, published ${late.body?.published}, failed ${late.body?.failed}`,
  );

  // 11. the post is PUBLISHED through the MOCK adapter (proves no real side effect)
  const final = await req(jar, `${baseUrl}/api/posts/${postId}`);
  const p = final.body;
  check("post is PUBLISHED", p?.status === "PUBLISHED", `status ${p?.status}`);
  check(
    "publish went through the mock adapter",
    String(p?.platformPostId ?? "").startsWith("mock_post_"),
    p?.platformPostId ?? "no platformPostId",
  );
  check("publishedAt recorded", !!p?.publishedAt, p?.publishedAt ?? "missing");

  // 12. no double publish: a second cron run must be a no-op
  const again = await req(jar, `${baseUrl}/api/cron/publish`, { headers: { authorization: `Bearer ${cronSecret}` } });
  check(
    "second cron run does not double-post",
    again.status === 200 && again.body?.processed === 0 && again.body?.published === 0,
    `processed ${again.body?.processed}, published ${again.body?.published}`,
  );

  const failed = RESULTS.filter((r) => !r.ok);
  console.log(`\n${RESULTS.length - failed.length}/${RESULTS.length} checks passed`);
  return { ok: failed.length === 0, results: RESULTS };
}
