/**
 * SocialOrc route contract suite — real HTTP against a real database.
 *
 * Covers the API routes that had neither a test importing them nor an HTTP
 * driver. For each route, as far as it applies:
 *
 *   - the happy path,
 *   - 401 for an anonymous caller,
 *   - 403 for a role that lacks the permission (an invited CLIENT or EDITOR),
 *   - 404 for a row in another workspace (never 403, never success),
 *   - input validation (400, never a 500).
 *
 * Inbox and Brand Brain are being rebuilt; for those only the auth and role
 * gates are asserted. The OAuth callback/persist logic is unit tested
 * (tests/unit/oauth-callback.test.ts) because the mock adapter has no
 * multi-Page grant to drive over HTTP.
 *
 * Runs inside tests/e2e/run.mjs (signups open, SIGNUP_ROLE=ADMIN, mock adapters,
 * TELEGRAM_BOT_TOKEN empty).
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
      if (idx <= 0) continue;
      const name = pair.slice(0, idx).trim();
      const value = pair.slice(idx + 1);
      if (value === "" || /max-age=0|expires=thu, 01 jan 1970/i.test(line)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }
  header() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

async function req(jar, url, { method = "GET", body, json, headers = {}, redirect = "manual" } = {}) {
  const h = { ...headers };
  const cookie = [jar.header(), headers.cookie].filter(Boolean).join("; ");
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

/** A redirect's target, parsed, or null. */
function target(res) {
  if (!res.location) return null;
  try {
    return new URL(res.location, "http://localhost");
  } catch {
    return null;
  }
}

export async function runRoutesE2E({ baseUrl }) {
  RESULTS.length = 0;
  const stamp = Date.now();
  const password = `routes-pass-${stamp}`;
  const url = (path) => `${baseUrl}${path}`;
  let ipSeq = 0;

  async function signUp(label, extra = {}) {
    const jar = new Jar();
    const email = `routes-${label}-${stamp}@example.test`;
    // A distinct forwarded address per signup: the register route is rate
    // limited per IP, and every suite in this run signs people up.
    const reg = await req(jar, url("/api/auth/register"), {
      method: "POST",
      json: { name: `Routes ${label}`, email, password, ...extra },
      headers: { "x-forwarded-for": `10.88.${Math.floor(stamp / 1000) % 250}.${++ipSeq}` },
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

  async function connectMock(jar, platform, brainId) {
    const q = new URLSearchParams({ platform });
    if (brainId) q.set("brainId", brainId);
    const start = await req(jar, url(`/api/social/connect?${q}`));
    const callback = start.body?.url ? await req(jar, start.body.url) : null;
    const accounts = await req(jar, url(`/api/accounts${brainId ? `?brainId=${brainId}` : ""}`));
    return {
      start,
      callback,
      account: (accounts.body?.accounts ?? []).find((a) => a.platform === platform) ?? null,
    };
  }

  const anon = new Jar();
  const expectStatus = (name, res, expected) =>
    check(name, res.status === expected, `status ${res.status}${res.body?.error ? ` (${res.body.error})` : ""}`);

  console.log(`\nSocialOrc route contract E2E — ${baseUrl}`);

  // ------------------------------------------------------------------ setup
  const owner = await signUp("owner");
  check("owner (ADMIN) signs up", owner.reg.status === 200 && !!owner.id, `status ${owner.reg.status}`);
  const invite = async (role) => {
    const res = await req(owner.jar, url("/api/workspace/invitations"), {
      method: "POST",
      json: { email: `routes-${role.toLowerCase()}-${stamp}@example.test`, role },
    });
    return res.body?.token ?? "";
  };
  const client = await signUp("client", { inviteToken: await invite("CLIENT") });
  const editor = await signUp("editor", { inviteToken: await invite("EDITOR") });
  check(
    "invited CLIENT and EDITOR join the owner's workspace",
    client.reg.body?.role === "CLIENT" && editor.reg.body?.role === "EDITOR",
    `${client.reg.body?.role}/${editor.reg.body?.role}`,
  );
  const intruder = await signUp("intruder");
  check("a second workspace's admin signs up", intruder.reg.status === 200 && !!intruder.id);

  const linkedIn = await connectMock(owner.jar, "LINKEDIN");
  const account = linkedIn.account;
  check("owner connects a mock LinkedIn account", !!account?.id);
  const intruderLinkedIn = await connectMock(intruder.jar, "LINKEDIN");
  check("intruder connects its own mock LinkedIn account", !!intruderLinkedIn.account?.id);

  const ws = await req(owner.jar, url("/api/workspaces"));
  const workspaceId = ws.body?.workspaces?.[0]?.id ?? null;
  const intruderWs = await req(intruder.jar, url("/api/workspaces"));
  const intruderWorkspaceId = intruderWs.body?.workspaces?.[0]?.id ?? null;

  // -------------------------------------------------------------- workspaces
  expectStatus("workspaces: anonymous is 401", await req(anon, url("/api/workspaces")), 401);
  check(
    "workspaces: each member sees exactly their own workspace",
    ws.status === 200 &&
      ws.body?.workspaces?.length === 1 &&
      intruderWs.body?.workspaces?.length === 1 &&
      workspaceId !== intruderWorkspaceId,
    `${workspaceId} vs ${intruderWorkspaceId}`,
  );
  const clientWs = await req(client.jar, url("/api/workspaces"));
  check(
    "workspaces: an invitee's membership is the inviter's workspace",
    clientWs.body?.workspaces?.[0]?.id === workspaceId,
    clientWs.body?.workspaces?.[0]?.membershipRole ?? "none",
  );

  // ------------------------------------------------------------------ brains
  expectStatus("brains: anonymous GET is 401", await req(anon, url("/api/brains")), 401);
  const clientBrains = await req(client.jar, url("/api/brains"));
  const defaultBrainId = clientBrains.body?.brains?.[0]?.id ?? null;
  check(
    "brains: a CLIENT may read the workspace's brains",
    clientBrains.status === 200 && clientBrains.body?.brains?.length === 1 && clientBrains.body.brains[0].connectedAccounts === 1,
    `status ${clientBrains.status}, ${clientBrains.body?.brains?.length ?? 0} brains`,
  );
  expectStatus("brains: anonymous POST is 401", await req(anon, url("/api/brains"), { method: "POST", json: { name: "x" } }), 401);
  expectStatus(
    "brains: CLIENT POST is 403",
    await req(client.jar, url("/api/brains"), { method: "POST", json: { name: "client brain" } }),
    403,
  );
  expectStatus(
    "brains: EDITOR POST is 403",
    await req(editor.jar, url("/api/brains"), { method: "POST", json: { name: "editor brain" } }),
    403,
  );
  expectStatus(
    "brains: a blank name is 400",
    await req(owner.jar, url("/api/brains"), { method: "POST", json: { name: "   " } }),
    400,
  );
  expectStatus(
    "brains: a non-JSON body is 400",
    await req(owner.jar, url("/api/brains"), { method: "POST", body: "not json", headers: { "content-type": "application/json" } }),
    400,
  );
  const second = await req(owner.jar, url("/api/brains"), { method: "POST", json: { name: `  Second ${stamp}  ` } });
  const secondId = second.body?.brain?.id ?? null;
  check(
    "brains: owner creates a brain (name trimmed, not default)",
    second.status === 200 && second.body?.brain?.name === `Second ${stamp}` && second.body?.brain?.isDefault === false,
    `status ${second.status}`,
  );
  const intruderBrains = await req(intruder.jar, url("/api/brains"));
  check(
    "brains: another workspace's list does not include it",
    intruderBrains.status === 200 && !(intruderBrains.body?.brains ?? []).some((b) => b.id === secondId),
  );

  // brains/[id]
  expectStatus(
    "brains/[id]: anonymous PATCH is 401",
    await req(anon, url(`/api/brains/${secondId}`), { method: "PATCH", json: { name: "x" } }),
    401,
  );
  expectStatus(
    "brains/[id]: CLIENT PATCH is 403",
    await req(client.jar, url(`/api/brains/${secondId}`), { method: "PATCH", json: { name: "x" } }),
    403,
  );
  expectStatus(
    "brains/[id]: cross-workspace PATCH is 404",
    await req(intruder.jar, url(`/api/brains/${secondId}`), { method: "PATCH", json: { name: "x" } }),
    404,
  );
  expectStatus(
    "brains/[id]: unknown id is 404",
    await req(owner.jar, url("/api/brains/does-not-exist"), { method: "PATCH", json: { name: "x" } }),
    404,
  );
  expectStatus(
    "brains/[id]: blank rename is 400",
    await req(owner.jar, url(`/api/brains/${secondId}`), { method: "PATCH", json: { name: "" } }),
    400,
  );
  const renamed = await req(owner.jar, url(`/api/brains/${secondId}`), { method: "PATCH", json: { name: "Renamed" } });
  check("brains/[id]: owner renames", renamed.status === 200 && renamed.body?.brain?.name === "Renamed", `status ${renamed.status}`);

  const twitter = await connectMock(owner.jar, "TWITTER", secondId);
  check("brains/[id]: a mock account is connected into the second brain", !!twitter.account?.id);

  expectStatus(
    "brains/[id]: anonymous DELETE is 401",
    await req(anon, url(`/api/brains/${secondId}`), { method: "DELETE" }),
    401,
  );
  expectStatus(
    "brains/[id]: CLIENT DELETE is 403",
    await req(client.jar, url(`/api/brains/${secondId}`), { method: "DELETE" }),
    403,
  );
  expectStatus(
    "brains/[id]: cross-workspace DELETE is 404",
    await req(intruder.jar, url(`/api/brains/${secondId}`), { method: "DELETE" }),
    404,
  );
  const deleted = await req(owner.jar, url(`/api/brains/${secondId}`), { method: "DELETE" });
  check(
    "brains/[id]: deleting moves its accounts to the fallback brain",
    deleted.status === 200 && deleted.body?.movedAccounts === 1 && deleted.body?.fallbackBrainId === defaultBrainId,
    `status ${deleted.status}, moved ${deleted.body?.movedAccounts}`,
  );
  const afterDelete = await req(owner.jar, url("/api/accounts"));
  check(
    "brains/[id]: the moved account is listed under the default brain",
    (afterDelete.body?.accounts ?? []).some((a) => a.id === twitter.account?.id),
  );
  const onlyOne = await req(owner.jar, url(`/api/brains/${defaultBrainId}`), { method: "DELETE" });
  check(
    "brains/[id]: the only brain cannot be deleted (400)",
    onlyOne.status === 400 && /only brain/i.test(onlyOne.body?.error ?? ""),
    `status ${onlyOne.status}`,
  );

  // ------------------------------------------------------------- shared post
  const created = await req(owner.jar, url("/api/posts"), {
    method: "POST",
    json: { content: `Routes post ${stamp}`, platform: "LINKEDIN", socialAccountId: account?.id },
  });
  const postId = created.body?.id ?? null;
  check("a workspace post exists for the feed and scheduling checks", created.status === 201 || created.status === 200, `status ${created.status}`);

  // -------------------------------------------------------------------- feed
  expectStatus("feed: anonymous is 401", await req(anon, url("/api/feed")), 401);
  const clientFeed = await req(client.jar, url("/api/feed?limit=999&offset=-5"));
  check(
    "feed: a CLIENT reads the workspace timeline; limit/offset are clamped",
    clientFeed.status === 200 &&
      clientFeed.body?.limit === 50 &&
      clientFeed.body?.offset === 0 &&
      (clientFeed.body?.posts ?? []).some((p) => p.id === postId) &&
      clientFeed.body?.viewerId === client.id,
    `status ${clientFeed.status}, limit ${clientFeed.body?.limit}`,
  );
  const intruderFeed = await req(intruder.jar, url("/api/feed"));
  check(
    "feed: another workspace sees none of it",
    intruderFeed.status === 200 && !(intruderFeed.body?.posts ?? []).some((p) => p.id === postId),
  );

  // feed/reactions
  expectStatus(
    "feed/reactions: anonymous is 401",
    await req(anon, url("/api/feed/reactions"), { method: "POST", json: { postId, type: "LIKE" } }),
    401,
  );
  expectStatus(
    "feed/reactions: CLIENT is 403",
    await req(client.jar, url("/api/feed/reactions"), { method: "POST", json: { postId, type: "LIKE" } }),
    403,
  );
  expectStatus(
    "feed/reactions: an unknown reaction type is 400",
    await req(editor.jar, url("/api/feed/reactions"), { method: "POST", json: { postId, type: "LOVE" } }),
    400,
  );
  expectStatus(
    "feed/reactions: a missing body is 400",
    await req(editor.jar, url("/api/feed/reactions"), { method: "POST" }),
    400,
  );
  expectStatus(
    "feed/reactions: cross-workspace is 404",
    await req(intruder.jar, url("/api/feed/reactions"), { method: "POST", json: { postId, type: "LIKE" } }),
    404,
  );
  const liked = await req(editor.jar, url("/api/feed/reactions"), { method: "POST", json: { postId, type: "LIKE" } });
  const switched = await req(editor.jar, url("/api/feed/reactions"), { method: "POST", json: { postId, type: "CELEBRATE" } });
  const toggled = await req(editor.jar, url("/api/feed/reactions"), { method: "POST", json: { postId, type: "CELEBRATE" } });
  const mine = (res) => (res.body?.reactions ?? []).filter((r) => r.userId === editor.id);
  check(
    "feed/reactions: react, change the reaction, and toggle it off",
    liked.status === 200 &&
      mine(liked).length === 1 &&
      mine(liked)[0].type === "LIKE" &&
      mine(switched).length === 1 &&
      mine(switched)[0].type === "CELEBRATE" &&
      mine(toggled).length === 0,
    `${liked.status}/${switched.status}/${toggled.status}`,
  );

  // feed/comments
  expectStatus(
    "feed/comments: anonymous POST is 401",
    await req(anon, url("/api/feed/comments"), { method: "POST", json: { postId, content: "hi" } }),
    401,
  );
  expectStatus(
    "feed/comments: CLIENT POST is 403",
    await req(client.jar, url("/api/feed/comments"), { method: "POST", json: { postId, content: "hi" } }),
    403,
  );
  expectStatus(
    "feed/comments: a blank comment is 400",
    await req(editor.jar, url("/api/feed/comments"), { method: "POST", json: { postId, content: "   " } }),
    400,
  );
  expectStatus(
    "feed/comments: a comment over 1,000 characters is 400",
    await req(editor.jar, url("/api/feed/comments"), { method: "POST", json: { postId, content: "x".repeat(1001) } }),
    400,
  );
  expectStatus(
    "feed/comments: cross-workspace POST is 404",
    await req(intruder.jar, url("/api/feed/comments"), { method: "POST", json: { postId, content: "hi" } }),
    404,
  );
  const comment = await req(editor.jar, url("/api/feed/comments"), {
    method: "POST",
    json: { postId, content: "  Nice one  " },
  });
  const commentId = comment.body?.comment?.id ?? null;
  check(
    "feed/comments: an EDITOR comments (trimmed, attributed)",
    comment.status === 201 && comment.body?.comment?.content === "Nice one" && comment.body?.comment?.user?.id === editor.id,
    `status ${comment.status}`,
  );
  expectStatus(
    "feed/comments: anonymous DELETE is 401",
    await req(anon, url(`/api/feed/comments?id=${commentId}`), { method: "DELETE" }),
    401,
  );
  expectStatus(
    "feed/comments: DELETE without an id is 400",
    await req(editor.jar, url("/api/feed/comments"), { method: "DELETE" }),
    400,
  );
  expectStatus(
    "feed/comments: a teammate cannot delete someone else's comment (404)",
    await req(owner.jar, url(`/api/feed/comments?id=${commentId}`), { method: "DELETE" }),
    404,
  );
  expectStatus(
    "feed/comments: cross-workspace DELETE is 404",
    await req(intruder.jar, url(`/api/feed/comments?id=${commentId}`), { method: "DELETE" }),
    404,
  );
  expectStatus(
    "feed/comments: the author deletes their comment",
    await req(editor.jar, url(`/api/feed/comments?id=${commentId}`), { method: "DELETE" }),
    200,
  );

  // --------------------------------------------------- traction / growth brief
  expectStatus("traction: anonymous is 401", await req(anon, url("/api/traction")), 401);
  expectStatus("growth-brief: anonymous is 401", await req(anon, url("/api/growth-brief")), 401);
  const traction = await req(client.jar, url("/api/traction"));
  const intruderTraction = await req(intruder.jar, url("/api/traction"));
  check(
    "traction: scored from the caller's workspace only",
    traction.status === 200 &&
      typeof traction.body?.score === "number" &&
      traction.body?.metrics?.total >= 1 &&
      intruderTraction.status === 200 &&
      intruderTraction.body?.metrics?.total === 0,
    `workspace ${traction.body?.metrics?.total}, other ${intruderTraction.body?.metrics?.total}`,
  );
  const brief = await req(client.jar, url("/api/growth-brief"));
  const intruderBrief = await req(intruder.jar, url("/api/growth-brief"));
  check(
    "growth-brief: built from the caller's workspace only",
    brief.status === 200 &&
      brief.body?.tractionScore?.metrics?.total === traction.body?.metrics?.total &&
      Array.isArray(brief.body?.recommendations) &&
      intruderBrief.body?.tractionScore?.metrics?.total === 0,
    `status ${brief.status}`,
  );

  // ----------------------------------------------------------------- profile
  expectStatus("profile: anonymous GET is 401", await req(anon, url("/api/profile")), 401);
  const ownerProfile = await req(owner.jar, url("/api/profile"));
  check(
    "profile: GET returns the caller and only their own posts",
    ownerProfile.status === 200 &&
      ownerProfile.body?.profile?.email === owner.email &&
      (ownerProfile.body?.posts ?? []).some((p) => p.id === postId),
    `status ${ownerProfile.status}`,
  );
  const editorProfile = await req(editor.jar, url("/api/profile"));
  check(
    "profile: a teammate's profile does not list the owner's posts",
    editorProfile.status === 200 && !(editorProfile.body?.posts ?? []).some((p) => p.id === postId),
  );
  const fullProfile = {
    name: "Routes Owner",
    headline: "Head of things",
    bio: "",
    location: "Oslo",
    website: "https://example.test",
    image: "",
    coverImageUrl: "",
  };
  expectStatus(
    "profile: anonymous PATCH is 401",
    await req(anon, url("/api/profile"), { method: "PATCH", json: fullProfile }),
    401,
  );
  expectStatus(
    "profile: a non-URL website is 400",
    await req(owner.jar, url("/api/profile"), { method: "PATCH", json: { ...fullProfile, website: "not a url" } }),
    400,
  );
  expectStatus(
    "profile: a blank name is 400",
    await req(owner.jar, url("/api/profile"), { method: "PATCH", json: { ...fullProfile, name: " " } }),
    400,
  );
  const patched = await req(owner.jar, url("/api/profile"), { method: "PATCH", json: fullProfile });
  check(
    "profile: PATCH saves; empty strings become null",
    patched.status === 200 &&
      patched.body?.profile?.headline === "Head of things" &&
      patched.body?.profile?.bio === null &&
      patched.body?.profile?.email === owner.email,
    `status ${patched.status}`,
  );
  const clientPatch = await req(client.jar, url("/api/profile"), {
    method: "PATCH",
    json: { ...fullProfile, name: "Client Person", website: "" },
  });
  check(
    "profile: a CLIENT edits their own profile (no role needed) and nobody else's",
    clientPatch.status === 200 && clientPatch.body?.profile?.email === client.email,
    `status ${clientPatch.status}`,
  );

  // -------------------------------------------------------- settings/profile
  expectStatus("settings/profile: anonymous GET is 401", await req(anon, url("/api/settings/profile")), 401);
  expectStatus(
    "settings/profile: anonymous PATCH is 401",
    await req(anon, url("/api/settings/profile"), { method: "PATCH", json: { name: "x", timezone: "UTC" } }),
    401,
  );
  expectStatus(
    "settings/profile: an unknown time zone is 400",
    await req(owner.jar, url("/api/settings/profile"), { method: "PATCH", json: { name: "Owner", timezone: "Mars/Olympus" } }),
    400,
  );
  expectStatus(
    "settings/profile: a missing name is 400",
    await req(owner.jar, url("/api/settings/profile"), { method: "PATCH", json: { timezone: "UTC" } }),
    400,
  );
  expectStatus(
    "settings/profile: a non-JSON body is 400",
    await req(owner.jar, url("/api/settings/profile"), { method: "PATCH", body: "{", headers: { "content-type": "application/json" } }),
    400,
  );
  const tz = await req(client.jar, url("/api/settings/profile"), {
    method: "PATCH",
    json: { name: " Client Tz ", timezone: "Africa/Cairo" },
  });
  const tzRead = await req(client.jar, url("/api/settings/profile"));
  check(
    "settings/profile: PATCH then GET round-trips name and time zone",
    tz.status === 200 && tzRead.body?.profile?.timezone === "Africa/Cairo" && tzRead.body?.profile?.name === "Client Tz",
    `status ${tz.status}/${tzRead.status}`,
  );

  // ----------------------------------------------------------- social/status
  expectStatus("social/status: anonymous is 401", await req(anon, url("/api/social/status")), 401);
  const status = await req(client.jar, url("/api/social/status"));
  const intruderStatus = await req(intruder.jar, url("/api/social/status"));
  check(
    "social/status: counts connections in the caller's workspace only",
    status.status === 200 &&
      Array.isArray(status.body?.platforms) &&
      status.body?.totals?.connected >= 2 &&
      intruderStatus.body?.totals?.connected === 1,
    `workspace ${status.body?.totals?.connected}, other ${intruderStatus.body?.totals?.connected}`,
  );
  check(
    "social/status: the report carries no secret values",
    !/mock_access_token|TOKEN_ENCRYPTION_KEY=|NEXTAUTH_SECRET=/.test(status.text),
  );

  // ---------------------------------------------------------- social/pending
  expectStatus("social/pending: anonymous GET is 401", await req(anon, url("/api/social/pending?platform=FACEBOOK")), 401);
  expectStatus(
    "social/pending: CLIENT is 403",
    await req(client.jar, url("/api/social/pending?platform=FACEBOOK")),
    403,
  );
  expectStatus(
    "social/pending: EDITOR is 403",
    await req(editor.jar, url("/api/social/pending"), { method: "POST", json: { platform: "FACEBOOK", targetId: "x" } }),
    403,
  );
  expectStatus(
    "social/pending: a platform with nothing to choose is 400",
    await req(owner.jar, url("/api/social/pending?platform=LINKEDIN")),
    400,
  );
  const noGrant = await req(owner.jar, url("/api/social/pending?platform=FACEBOOK"));
  check(
    "social/pending: no pending grant is 410 PENDING_MISSING",
    noGrant.status === 410 && noGrant.body?.code === "PENDING_MISSING",
    `status ${noGrant.status} ${noGrant.body?.code ?? ""}`,
  );
  expectStatus(
    "social/pending: POST without a targetId is 400",
    await req(owner.jar, url("/api/social/pending"), { method: "POST", json: { platform: "FACEBOOK" } }),
    400,
  );
  const forged = await req(owner.jar, url("/api/social/pending"), {
    method: "POST",
    json: { platform: "INSTAGRAM", targetId: "page_1" },
    headers: { cookie: `oauth_pending_instagram=forged.${Buffer.from("{}").toString("base64url")}` },
  });
  check(
    "social/pending: a forged pending cookie is 410 PENDING_MALFORMED and connects nothing",
    forged.status === 410 && forged.body?.code === "PENDING_MALFORMED",
    `status ${forged.status} ${forged.body?.code ?? ""}`,
  );
  const abandon = await req(owner.jar, url("/api/social/pending?platform=FACEBOOK"), { method: "DELETE" });
  check("social/pending: DELETE abandons the grant", abandon.status === 200 && abandon.body?.success === true);
  expectStatus(
    "social/pending: DELETE with an invalid platform is 400",
    await req(owner.jar, url("/api/social/pending?platform=nope"), { method: "DELETE" }),
    400,
  );

  // ----------------------------------------------------- social/mock/callback
  const anonMock = target(await req(anon, url("/api/social/mock/callback?state=x&platform=LINKEDIN")));
  check(
    "social/mock/callback: anonymous is sent to sign in",
    anonMock?.pathname === "/login" && anonMock.searchParams.get("error") === "unauthorized",
    anonMock?.toString() ?? "no redirect",
  );
  const clientMock = target(await req(client.jar, url("/api/social/mock/callback?state=x&platform=LINKEDIN")));
  check(
    "social/mock/callback: CLIENT is refused (not_allowed)",
    clientMock?.searchParams.get("error") === "not_allowed",
    clientMock?.toString() ?? "no redirect",
  );
  const badMock = target(await req(owner.jar, url("/api/social/mock/callback?state=x&platform=MYSPACE")));
  check(
    "social/mock/callback: an unknown platform is invalid_mock_params",
    badMock?.searchParams.get("error") === "invalid_mock_params",
    badMock?.toString() ?? "no redirect",
  );
  const forgedBrain = target(
    await req(intruder.jar, url("/api/social/mock/callback?state=nostate&platform=YOUTUBE")),
  );
  const intruderAccounts = await req(intruder.jar, url("/api/accounts"));
  const ownerAccounts = await req(owner.jar, url("/api/accounts"));
  check(
    "social/mock/callback: connects into the caller's own workspace only",
    forgedBrain?.searchParams.get("success") === "youtube_mock_connected" &&
      (intruderAccounts.body?.accounts ?? []).some((a) => a.platform === "YOUTUBE") &&
      !(ownerAccounts.body?.accounts ?? []).some((a) => a.platform === "YOUTUBE"),
    forgedBrain?.toString() ?? "no redirect",
  );

  // ------------------------------------------------- social/telegram/connect
  const anonTg = target(await req(anon, url("/api/social/telegram/connect")));
  check(
    "social/telegram/connect: anonymous is sent to sign in",
    anonTg?.pathname === "/login",
    anonTg?.toString() ?? "no redirect",
  );
  const clientTg = target(await req(client.jar, url("/api/social/telegram/connect")));
  check(
    "social/telegram/connect: CLIENT is refused (not_allowed)",
    clientTg?.searchParams.get("error") === "not_allowed",
    clientTg?.toString() ?? "no redirect",
  );
  const ownerTg = target(await req(owner.jar, url("/api/social/telegram/connect?chatId=12345")));
  check(
    "social/telegram/connect: an unconfigured bot says so, naming the variable",
    ownerTg?.searchParams.get("error") === "telegram_not_configured" &&
      /TELEGRAM_BOT_TOKEN/.test(ownerTg.searchParams.get("missing") ?? ""),
    ownerTg?.toString() ?? "no redirect",
  );

  // ----------------------------------------------------------- ai/credentials
  expectStatus("ai/credentials: anonymous GET is 401", await req(anon, url("/api/ai/credentials")), 401);
  expectStatus(
    "ai/credentials: anonymous PUT is 401",
    await req(anon, url("/api/ai/credentials"), { method: "PUT", json: { apiKey: "sk-anon-123456" } }),
    401,
  );
  const emptyCred = await req(editor.jar, url("/api/ai/credentials"));
  check(
    "ai/credentials: nothing stored yet",
    emptyCred.status === 200 && emptyCred.body?.configured === false && emptyCred.body?.keyHint === null,
    `status ${emptyCred.status}`,
  );
  expectStatus(
    "ai/credentials: a too-short key is 400",
    await req(editor.jar, url("/api/ai/credentials"), { method: "PUT", json: { apiKey: "short" } }),
    400,
  );
  expectStatus(
    "ai/credentials: an unknown kind is 400",
    await req(editor.jar, url("/api/ai/credentials"), { method: "PUT", json: { apiKey: "sk-editor-1234567890", kind: "audio" } }),
    400,
  );
  const badBase = await req(editor.jar, url("/api/ai/credentials"), {
    method: "PUT",
    json: { apiKey: "sk-editor-1234567890", baseUrl: "ftp://example.test/v1" },
  });
  check(
    "ai/credentials: a non-http(s) base URL is 400 invalid_base_url",
    badBase.status === 400 && badBase.body?.error === "invalid_base_url",
    `status ${badBase.status} ${badBase.body?.error ?? ""}`,
  );
  const secretKey = `sk-editor-${stamp}-WXYZ`;
  const putUser = await req(editor.jar, url("/api/ai/credentials"), {
    method: "PUT",
    json: { apiKey: secretKey, model: "gpt-test" },
  });
  const readUser = await req(editor.jar, url("/api/ai/credentials"));
  check(
    "ai/credentials: a member stores a personal key; only the last four come back",
    putUser.status === 200 &&
      readUser.body?.configured === true &&
      readUser.body?.model === "gpt-test" &&
      /WXYZ$/.test(readUser.body?.keyHint ?? "") &&
      !putUser.text.includes(secretKey) &&
      !readUser.text.includes(secretKey),
    `status ${putUser.status}, hint ${readUser.body?.keyHint}`,
  );
  const ownerSeesEditor = await req(owner.jar, url("/api/ai/credentials"));
  check("ai/credentials: a personal key is invisible to teammates", ownerSeesEditor.body?.configured === false);
  const editorWs = await req(editor.jar, url("/api/ai/credentials"), {
    method: "PUT",
    json: { scope: "workspace", workspaceId, apiKey: "sk-editor-team-123456" },
  });
  check(
    "ai/credentials: an EDITOR cannot set the workspace key (403)",
    editorWs.status === 403 && editorWs.body?.error === "forbidden",
    `status ${editorWs.status}`,
  );
  expectStatus(
    "ai/credentials: workspace scope without a workspaceId is 400",
    await req(owner.jar, url("/api/ai/credentials"), { method: "PUT", json: { scope: "workspace", apiKey: "sk-owner-team-123456" } }),
    400,
  );
  const foreignWs = await req(owner.jar, url("/api/ai/credentials"), {
    method: "PUT",
    json: { scope: "workspace", workspaceId: intruderWorkspaceId, apiKey: "sk-owner-team-123456" },
  });
  check(
    "ai/credentials: another workspace's key cannot be written (403 not_a_member)",
    foreignWs.status === 403 && foreignWs.body?.error === "not_a_member",
    `status ${foreignWs.status}`,
  );
  const foreignRead = await req(owner.jar, url(`/api/ai/credentials?scope=workspace&workspaceId=${intruderWorkspaceId}`));
  expectStatus("ai/credentials: another workspace's key cannot be read", foreignRead, 403);
  const teamPut = await req(owner.jar, url("/api/ai/credentials"), {
    method: "PUT",
    json: { scope: "workspace", workspaceId, apiKey: "sk-owner-team-1234ABCD" },
  });
  const teamRead = await req(owner.jar, url(`/api/ai/credentials?scope=workspace&workspaceId=${workspaceId}`));
  check(
    "ai/credentials: the admin sets the workspace key",
    teamPut.status === 200 && teamRead.body?.configured === true && teamRead.body?.keyHint?.endsWith("ABCD"),
    `status ${teamPut.status}`,
  );
  const intruderTeam = await req(intruder.jar, url(`/api/ai/credentials?scope=workspace&workspaceId=${intruderWorkspaceId}`));
  check("ai/credentials: the other workspace's own key is untouched", intruderTeam.body?.configured === false);
  const removed = await req(editor.jar, url("/api/ai/credentials"), { method: "DELETE" });
  const removedAgain = await req(editor.jar, url("/api/ai/credentials"), { method: "DELETE" });
  check(
    "ai/credentials: DELETE removes the key, and is idempotent",
    removed.status === 200 && removed.body?.removed === true && removedAgain.body?.removed === false,
    `${removed.status}/${removedAgain.status}`,
  );
  expectStatus(
    "ai/credentials: CLIENT cannot delete the workspace key (403)",
    await req(client.jar, url(`/api/ai/credentials?scope=workspace&workspaceId=${workspaceId}`), { method: "DELETE" }),
    403,
  );

  // ------------------------------------------------- posts/[id]/reschedule
  await req(owner.jar, url(`/api/posts/${postId}/approve`), { method: "POST", json: { action: "approve" } });
  const inAnHour = new Date(Date.now() + 3_600_000).toISOString();
  const inTwoHours = new Date(Date.now() + 7_200_000).toISOString();
  const notYet = await req(owner.jar, url(`/api/posts/${postId}/reschedule`), {
    method: "PATCH",
    json: { scheduledFor: inTwoHours },
  });
  check(
    "reschedule: a post that is not SCHEDULED is 400",
    notYet.status === 400 && /SCHEDULED/.test(notYet.body?.error ?? ""),
    `status ${notYet.status}`,
  );
  const scheduled = await req(owner.jar, url(`/api/posts/${postId}/schedule`), {
    method: "POST",
    json: { scheduledFor: inAnHour },
  });
  check("reschedule: setup — the post is scheduled", scheduled.status === 200, `status ${scheduled.status}`);
  const reschedule = (jar, json) =>
    req(jar, url(`/api/posts/${postId}/reschedule`), { method: "PATCH", json });
  expectStatus("reschedule: anonymous is 401", await reschedule(anon, { scheduledFor: inTwoHours }), 401);
  expectStatus("reschedule: CLIENT is 403", await reschedule(client.jar, { scheduledFor: inTwoHours }), 403);
  expectStatus("reschedule: EDITOR is 403", await reschedule(editor.jar, { scheduledFor: inTwoHours }), 403);
  expectStatus("reschedule: cross-workspace is 404", await reschedule(intruder.jar, { scheduledFor: inTwoHours }), 404);
  expectStatus("reschedule: a missing time is 400", await reschedule(owner.jar, {}), 400);
  expectStatus(
    "reschedule: a time in the past is 400",
    await reschedule(owner.jar, { scheduledFor: new Date(Date.now() - 60_000).toISOString() }),
    400,
  );
  expectStatus("reschedule: an unparseable time is 400", await reschedule(owner.jar, { scheduledFor: "next tuesday-ish" }), 400);
  expectStatus(
    "reschedule: a non-JSON body is 400",
    await req(owner.jar, url(`/api/posts/${postId}/reschedule`), {
      method: "PATCH",
      body: "{",
      headers: { "content-type": "application/json" },
    }),
    400,
  );
  const moved = await reschedule(owner.jar, { scheduledFor: inTwoHours });
  check(
    "reschedule: the owner moves the post",
    moved.status === 200 &&
      new Date(moved.body?.post?.scheduledFor).getTime() === new Date(inTwoHours).getTime() &&
      moved.body?.post?.status === "SCHEDULED",
    `status ${moved.status}`,
  );

  // ------------------------------------------------------ posts/[id]/retry
  const ig = await connectMock(owner.jar, "INSTAGRAM");
  const failing = await req(owner.jar, url("/api/posts"), {
    method: "POST",
    json: { content: `Text-only Instagram post ${stamp}`, platform: "INSTAGRAM", socialAccountId: ig.account?.id },
  });
  const failingId = failing.body?.id ?? null;
  await req(owner.jar, url(`/api/posts/${failingId}/approve`), { method: "POST", json: { action: "approve" } });
  const publishNow = await req(owner.jar, url(`/api/posts/${failingId}/publish`), { method: "POST" });
  const failedPost = await req(owner.jar, url(`/api/posts/${failingId}`));
  check(
    "retry: setup — a text-only Instagram publish ends FAILED",
    failedPost.body?.status === "FAILED",
    `publish ${publishNow.status}, status ${failedPost.body?.status}`,
  );
  const retry = (jar, id = failingId, json = {}) => req(jar, url(`/api/posts/${id}/retry`), { method: "POST", json });
  expectStatus("retry: anonymous is 401", await retry(anon), 401);
  expectStatus("retry: CLIENT is 403", await retry(client.jar), 403);
  expectStatus("retry: EDITOR is 403", await retry(editor.jar), 403);
  expectStatus("retry: cross-workspace is 404", await retry(intruder.jar), 404);
  expectStatus("retry: a malformed body is 400", await retry(owner.jar, failingId, { scheduledFor: 42 }), 400);
  const notFailed = await retry(owner.jar, postId);
  check(
    "retry: a post that has not failed is 400 not_failed",
    notFailed.status === 400 && notFailed.body?.reason === "not_failed",
    `status ${notFailed.status} ${notFailed.body?.reason ?? ""}`,
  );
  const requeued = await retry(owner.jar, failingId, { scheduledFor: "garbage" });
  check(
    "retry: the owner re-queues a failed, approved post (bad time falls back to the default)",
    requeued.status === 200 &&
      requeued.body?.post?.status === "SCHEDULED" &&
      new Date(requeued.body?.scheduledFor).getTime() > Date.now(),
    `status ${requeued.status}`,
  );
  const twice = await retry(owner.jar, failingId);
  check("retry: a second retry of the now-scheduled post is 400", twice.status === 400, `status ${twice.status}`);

  // --------------------------------------------------------- accounts DELETE
  expectStatus(
    "accounts DELETE: anonymous is 401",
    await req(anon, url(`/api/accounts?id=${account?.id}`), { method: "DELETE" }),
    401,
  );
  expectStatus(
    "accounts DELETE: CLIENT is 403",
    await req(client.jar, url(`/api/accounts?id=${account?.id}`), { method: "DELETE" }),
    403,
  );
  expectStatus(
    "accounts DELETE: EDITOR is 403",
    await req(editor.jar, url(`/api/accounts?id=${account?.id}`), { method: "DELETE" }),
    403,
  );
  expectStatus(
    "accounts DELETE: a missing id is 400",
    await req(owner.jar, url("/api/accounts"), { method: "DELETE" }),
    400,
  );
  expectStatus(
    "accounts DELETE: cross-workspace is 404",
    await req(intruder.jar, url(`/api/accounts?id=${account?.id}`), { method: "DELETE" }),
    404,
  );
  const disconnect = await req(owner.jar, url(`/api/accounts?id=${account?.id}`), { method: "DELETE" });
  const released = await req(owner.jar, url(`/api/posts/${postId}`));
  const accountsAfter = await req(owner.jar, url("/api/accounts"));
  check(
    "accounts DELETE: disconnect cancels the job and returns the scheduled post to APPROVED",
    disconnect.status === 200 &&
      disconnect.body?.cancelledJobs === 1 &&
      disconnect.body?.releasedPosts === 1 &&
      released.body?.status === "APPROVED" &&
      !(accountsAfter.body?.accounts ?? []).some((a) => a.id === account?.id),
    `status ${disconnect.status}, jobs ${disconnect.body?.cancelledJobs}, posts ${disconnect.body?.releasedPosts}, post ${released.body?.status}`,
  );
  expectStatus(
    "accounts DELETE: the same id again is 404",
    await req(owner.jar, url(`/api/accounts?id=${account?.id}`), { method: "DELETE" }),
    404,
  );
  const intruderStillHas = await req(intruder.jar, url("/api/accounts"));
  check(
    "accounts DELETE: the other workspace's account is untouched",
    (intruderStillHas.body?.accounts ?? []).some((a) => a.id === intruderLinkedIn.account?.id),
  );

  // ----------------------------------------------------------- media/finalize
  const blob = (userId, name = "pic.png") =>
    `https://abc123store.public.blob.vercel-storage.com/socialorc/${userId}/${name}`;
  const finalize = (jar, json) => req(jar, url("/api/media/finalize"), { method: "POST", json });
  const good = (userId) => ({ url: blob(userId), mimeType: "image/png", filename: "pic.png", size: 1024 });
  expectStatus("media/finalize: anonymous is 401", await finalize(anon, good("x")), 401);
  expectStatus("media/finalize: CLIENT is 403", await finalize(client.jar, good(client.id)), 403);
  expectStatus("media/finalize: missing fields are 400", await finalize(editor.jar, { url: blob(editor.id) }), 400);
  expectStatus(
    "media/finalize: a non-blob host is 400",
    await finalize(editor.jar, { ...good(editor.id), url: "https://evil.example/.public.blob.vercel-storage.com/x.png" }),
    400,
  );
  expectStatus(
    "media/finalize: another user's blob folder is 400",
    await finalize(editor.jar, { ...good(editor.id), url: blob(owner.id) }),
    400,
  );
  expectStatus(
    "media/finalize: a disallowed type is 400",
    await finalize(editor.jar, { ...good(editor.id), mimeType: "application/x-msdownload" }),
    400,
  );
  expectStatus(
    "media/finalize: an oversized file is 400",
    await finalize(editor.jar, { ...good(editor.id), size: 10 * 1024 * 1024 * 1024 }),
    400,
  );
  expectStatus(
    "media/finalize: a non-JSON body is 400",
    await req(editor.jar, url("/api/media/finalize"), { method: "POST", body: "{", headers: { "content-type": "application/json" } }),
    400,
  );
  const finalized = await finalize(editor.jar, good(editor.id));
  const assetId = finalized.body?.id ?? null;
  const teamMedia = await req(owner.jar, url("/api/media"));
  const otherMedia = await req(intruder.jar, url("/api/media"));
  check(
    "media/finalize: an EDITOR records the upload in the workspace library only",
    finalized.status === 201 &&
      (teamMedia.body?.assets ?? []).some((a) => a.id === assetId) &&
      !(otherMedia.body?.assets ?? []).some((a) => a.id === assetId),
    `status ${finalized.status}`,
  );

  // -------------------------------------------------------- media/upload-token
  const tokenBody = {
    type: "blob.generate-client-token",
    payload: { pathname: "socialorc/x/pic.png", callbackUrl: url("/api/media/upload-token"), clientPayload: null, multipart: false },
  };
  expectStatus(
    "media/upload-token: anonymous is 401",
    await req(anon, url("/api/media/upload-token"), { method: "POST", json: tokenBody }),
    401,
  );
  expectStatus(
    "media/upload-token: CLIENT is 403",
    await req(client.jar, url("/api/media/upload-token"), { method: "POST", json: tokenBody }),
    403,
  );
  expectStatus(
    "media/upload-token: a non-JSON body is 400",
    await req(editor.jar, url("/api/media/upload-token"), {
      method: "POST",
      body: "{",
      headers: { "content-type": "application/json" },
    }),
    400,
  );
  const noStore = await req(editor.jar, url("/api/media/upload-token"), { method: "POST", json: tokenBody });
  check(
    "media/upload-token: without a blob store configured it refuses with a JSON error, not a crash",
    noStore.status === 400 && typeof noStore.body?.error === "string",
    `status ${noStore.status}`,
  );

  // -------------------------------------------------- workspace/invitations
  expectStatus("invitations: anonymous GET is 401", await req(anon, url("/api/workspace/invitations")), 401);
  expectStatus("invitations: EDITOR GET is 403", await req(editor.jar, url("/api/workspace/invitations")), 403);
  expectStatus(
    "invitations: EDITOR POST is 403",
    await req(editor.jar, url("/api/workspace/invitations"), { method: "POST", json: { email: `x-${stamp}@example.test` } }),
    403,
  );
  expectStatus(
    "invitations: an invalid email is 400",
    await req(owner.jar, url("/api/workspace/invitations"), { method: "POST", json: { email: "not-an-email" } }),
    400,
  );
  expectStatus(
    "invitations: an unknown role is 400",
    await req(owner.jar, url("/api/workspace/invitations"), {
      method: "POST",
      json: { email: `role-${stamp}@example.test`, role: "OWNER" },
    }),
    400,
  );
  expectStatus(
    "invitations: a non-JSON body is 400",
    await req(owner.jar, url("/api/workspace/invitations"), { method: "POST", body: "{", headers: { "content-type": "application/json" } }),
    400,
  );
  expectStatus(
    "invitations: an email that already has an account is 409",
    await req(owner.jar, url("/api/workspace/invitations"), { method: "POST", json: { email: intruder.email } }),
    409,
  );
  const pendingInvite = await req(owner.jar, url("/api/workspace/invitations"), {
    method: "POST",
    json: { email: `  Pending-${stamp}@Example.TEST `, role: "MANAGER" },
  });
  const inviteId = pendingInvite.body?.invitation?.id ?? null;
  check(
    "invitations: the admin invites (email normalised, token shown once)",
    pendingInvite.status === 201 &&
      pendingInvite.body?.invitation?.email === `pending-${stamp}@example.test` &&
      pendingInvite.body?.invitation?.role === "MANAGER" &&
      typeof pendingInvite.body?.token === "string",
    `status ${pendingInvite.status}`,
  );
  const listed = await req(owner.jar, url("/api/workspace/invitations"));
  check(
    "invitations: the list shows pending invitations without their tokens",
    listed.status === 200 &&
      (listed.body?.invitations ?? []).some((i) => i.id === inviteId) &&
      !listed.text.includes(pendingInvite.body?.token ?? "\u0000") &&
      !(listed.body?.invitations ?? []).some((i) => i.email === client.email),
    `${listed.body?.invitations?.length ?? 0} pending`,
  );
  const intruderList = await req(intruder.jar, url("/api/workspace/invitations"));
  check(
    "invitations: another workspace's list does not include it",
    intruderList.status === 200 && !(intruderList.body?.invitations ?? []).some((i) => i.id === inviteId),
  );
  expectStatus(
    "invitations/[id]: anonymous DELETE is 401",
    await req(anon, url(`/api/workspace/invitations/${inviteId}`), { method: "DELETE" }),
    401,
  );
  expectStatus(
    "invitations/[id]: EDITOR DELETE is 403",
    await req(editor.jar, url(`/api/workspace/invitations/${inviteId}`), { method: "DELETE" }),
    403,
  );
  expectStatus(
    "invitations/[id]: cross-workspace DELETE is 404",
    await req(intruder.jar, url(`/api/workspace/invitations/${inviteId}`), { method: "DELETE" }),
    404,
  );
  expectStatus(
    "invitations/[id]: the admin revokes it",
    await req(owner.jar, url(`/api/workspace/invitations/${inviteId}`), { method: "DELETE" }),
    200,
  );
  expectStatus(
    "invitations/[id]: revoking again is 404",
    await req(owner.jar, url(`/api/workspace/invitations/${inviteId}`), { method: "DELETE" }),
    404,
  );

  // ------------------------------- inbox and brand brain: auth/role gates only
  // (both are being rebuilt; their behaviour is deliberately not pinned here)
  expectStatus("inbox: anonymous GET is 401", await req(anon, url("/api/inbox")), 401);
  expectStatus(
    "inbox: anonymous PATCH is 401",
    await req(anon, url("/api/inbox"), { method: "PATCH", json: { itemId: "x", platform: "LINKEDIN" } }),
    401,
  );
  expectStatus(
    "inbox: CLIENT reply is 403",
    await req(client.jar, url("/api/inbox"), { method: "PATCH", json: { itemId: "x", platform: "LINKEDIN", content: "hi" } }),
    403,
  );
  expectStatus("brand-brain: anonymous GET is 401", await req(anon, url("/api/brand-brain")), 401);
  expectStatus(
    "brand-brain: CLIENT POST is 403",
    await req(client.jar, url("/api/brand-brain"), { method: "POST", json: {} }),
    403,
  );
  expectStatus(
    "brand-brain: EDITOR PUT is 403",
    await req(editor.jar, url("/api/brand-brain"), { method: "PUT", json: {} }),
    403,
  );

  const failed = RESULTS.filter((r) => !r.ok);
  console.log(`\n${RESULTS.length - failed.length}/${RESULTS.length} route contract checks passed`);
  return { ok: failed.length === 0, results: [...RESULTS] };
}
