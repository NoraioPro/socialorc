/**
 * SocialOrc role + login regression harness.
 *
 * Proves, against a running server, that:
 *   - a browser over plain http://localhost keeps its auth cookies (the
 *     dead-tunnel NEXTAUTH_URL bug used to make them __Secure-/__Host- only),
 *   - registration normalises emails and rejects weak input,
 *   - the signup policy hands the first account ADMIN and the next one EDITOR,
 *   - role permissions are enforced server-side (403, not just hidden UI) —
 *     including that the removed dev-only role-minting endpoint stays removed,
 *   - the approval gate and the publish chain still work for an ADMIN.
 *
 * Usage (the server must allow signups for this run, and must NOT force a role,
 * or there is no EDITOR to assert against):
 *   ALLOW_PUBLIC_SIGNUP=true npx next dev -p 3200
 *   ROLES_BASE_URL=http://localhost:3200 node tests/e2e/roles.e2e.mjs
 * Exit code 0 = every check passed.
 */

import fs from "node:fs";
import path from "node:path";

const BASE_URL = process.env.ROLES_BASE_URL || "http://localhost:3200";

function cronSecret() {
  if (process.env.CRON_SECRET) return process.env.CRON_SECRET;
  try {
    const env = fs.readFileSync(path.resolve(process.cwd(), ".env"), "utf8");
    const match = env.match(/^CRON_SECRET="?([^"\n]+)"?/m);
    return match ? match[1] : "";
  } catch {
    return "";
  }
}

const RESULTS = [];

function check(name, ok, detail = "") {
  RESULTS.push({ name, ok, detail });
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
  return ok;
}

class Jar {
  constructor() {
    this.cookies = new Map();
    this.setCookieLines = [];
  }
  absorb(res) {
    const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const line of raw) {
      this.setCookieLines.push(line);
      const [pair] = line.split(";");
      const idx = pair.indexOf("=");
      if (idx > 0) this.cookies.set(pair.slice(0, idx).trim(), pair.slice(idx + 1));
    }
  }
  header() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  names() {
    return [...this.cookies.keys()];
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
    /* html */
  }
  return { status: res.status, body: parsed, text, location: res.headers.get("location") };
}

async function csrf(jar) {
  const res = await req(jar, `${BASE_URL}/api/auth/csrf`);
  return res.body?.csrfToken ?? "";
}

async function loginWithPassword(jar, email, password) {
  const token = await csrf(jar);
  const form = new URLSearchParams({
    csrfToken: token,
    email,
    password,
    json: "true",
    callbackUrl: BASE_URL,
  });
  return req(jar, `${BASE_URL}/api/auth/callback/credentials`, {
    method: "POST",
    body: form,
    headers: { "content-type": "application/x-www-form-urlencoded" },
  });
}

async function session(jar) {
  const res = await req(jar, `${BASE_URL}/api/auth/session`);
  return res.body ?? {};
}

const stamp = Date.now();
const password = `role-pass-${stamp}`;

console.log(`\nSocialOrc role/login E2E — ${BASE_URL}`);

// ---------------------------------------------------------------- cookies
{
  const jar = new Jar();
  await req(jar, `${BASE_URL}/api/auth/csrf`);
  const prefixed = jar.setCookieLines.filter(
    (line) => line.startsWith("set-cookie: __Host-") || /^__Host-|^__Secure-/.test(line)
  );
  check(
    "auth cookies are usable over plain http (no __Host-/__Secure- prefix)",
    prefixed.length === 0,
    prefixed.length ? prefixed[0].split(";")[0] : "plain cookie names"
  );
}

// ------------------------------------------------------------ registration
const mixedCaseEmail = `Role.Mixed-${stamp}@Socialorc.Local`;
{
  const jar = new Jar();
  const reg = await req(jar, `${BASE_URL}/api/auth/register`, {
    method: "POST",
    json: { name: "Mixed Case", email: mixedCaseEmail, password },
  });
  check(
    "register accepts a mixed-case email and stores an owner role",
    reg.status === 200 && !!reg.body?.id && reg.body?.role === "ADMIN",
    `status ${reg.status}, role ${reg.body?.role}, email ${reg.body?.email}`
  );
  check(
    "registered email is stored lower-cased",
    String(reg.body?.email ?? "") === mixedCaseEmail.toLowerCase(),
    reg.body?.email ?? "none"
  );

  const dup = await req(jar, `${BASE_URL}/api/auth/register`, {
    method: "POST",
    json: { name: "Dup", email: mixedCaseEmail.toLowerCase(), password },
  });
  check("duplicate registration is rejected with 400", dup.status === 400, `status ${dup.status}`);

  const weak = await req(jar, `${BASE_URL}/api/auth/register`, {
    method: "POST",
    json: { name: "Weak", email: `weak-${stamp}@socialorc.local`, password: "short" },
  });
  check("short password is rejected with 400", weak.status === 400, `status ${weak.status}`);

  const badEmail = await req(jar, `${BASE_URL}/api/auth/register`, {
    method: "POST",
    json: { name: "Bad", email: "not-an-email", password },
  });
  check("malformed email is rejected with 400", badEmail.status === 400, `status ${badEmail.status}`);
}

// ------------------------------------------------------------------ password login
{
  const jar = new Jar();
  await loginWithPassword(jar, mixedCaseEmail.toLowerCase(), password);
  const s = await session(jar);
  check(
    "password login works with the lower-cased email",
    s.user?.email === mixedCaseEmail.toLowerCase(),
    `session ${s.user?.email ?? "none"}`
  );
  check("session carries role ADMIN", s.user?.role === "ADMIN", `role ${s.user?.role}`);
  check(
    "admin session carries the full permission set",
    Array.isArray(s.user?.permissions) &&
      ["posts:approve", "posts:schedule", "users:manage"].every((p) =>
        s.user.permissions.includes(p)
      ),
    (s.user?.permissions ?? []).join(",")
  );
  const wrong = new Jar();
  const bad = await loginWithPassword(wrong, mixedCaseEmail.toLowerCase(), "definitely-wrong");
  check(
    "wrong password does not create a session",
    !(await session(wrong)).user?.email,
    `login status ${bad.status}`
  );
}

{
  // Mixed case at login time must still resolve.
  const jar = new Jar();
  await loginWithPassword(jar, mixedCaseEmail, password);
  const s = await session(jar);
  check(
    "login is case-insensitive on the email",
    s.user?.email === mixedCaseEmail.toLowerCase(),
    `session ${s.user?.email ?? "none"}`
  );
}

// ------------------------------------------------------- real roles, no dev door
// This block used to mint a session per role through `/api/dev/login-as`, a
// dev-only endpoint that has since been removed from the app — correctly, since
// a production build has no business shipping a role-minting backdoor. Roles now
// come from the product's own signup policy: the first account is ADMIN and every
// account after it is EDITOR (src/lib/signup-policy.ts + src/lib/roles.ts).
//
// MANAGER and CLIENT cannot be created over HTTP at all: there is no invite or
// role-assignment endpoint yet. That is a gap in the product, not in the test, and
// it is why this suite asserts the two roles the app can actually mint.
const roleSessions = {};

const editorEmail = `role.editor-${stamp}@socialorc.local`;
{
  const jar = new Jar();
  const reg = await req(jar, `${BASE_URL}/api/auth/register`, {
    method: "POST",
    json: { name: "Editor Role", email: editorEmail, password },
  });
  check(
    "a second signup is created as EDITOR, not ADMIN",
    reg.status === 200 && reg.body?.role === "EDITOR",
    `status ${reg.status}, role ${reg.body?.role ?? "none"}`
  );

  await loginWithPassword(jar, editorEmail, password);
  const s = await session(jar);
  roleSessions.EDITOR = { jar, session: s };
  check(
    "editor session omits the permissions that belong to management",
    Array.isArray(s.user?.permissions) &&
      ["posts:approve", "posts:schedule", "users:manage", "accounts:connect", "brains:manage"].every(
        (p) => !s.user.permissions.includes(p)
      ),
    (s.user?.permissions ?? []).join(",")
  );
}

{
  // The dev door must not exist in whatever we are pointed at.
  const res = await req(new Jar(), `${BASE_URL}/api/dev/login-as?role=ADMIN`);
  check(
    "no role-minting dev endpoint is reachable",
    res.status === 404,
    `status ${res.status}`
  );
}

{
  // The ADMIN session the publish chain below runs on, from a real login: with
  // the dev shortcut gone there is no other way to get one, which is the point.
  const jar = new Jar();
  await loginWithPassword(jar, mixedCaseEmail.toLowerCase(), password);
  const s = await session(jar);
  roleSessions.ADMIN = { jar, session: s };
  check(
    "admin session is available for the publish chain",
    !!s.user?.id && s.user.role === "ADMIN",
    s.user?.email ?? "none"
  );
}

// ------------------------------------------------------------ permission gates
{
  const anon = new Jar();
  const res = await req(anon, `${BASE_URL}/api/posts/does-not-exist/approve`, {
    method: "POST",
    json: { action: "approve" },
  });
  check("anonymous approve is 401", res.status === 401, `status ${res.status}`);
}

{
  const editorJar = roleSessions.EDITOR.jar;
  const res = await req(editorJar, `${BASE_URL}/api/posts/does-not-exist/approve`, {
    method: "POST",
    json: { action: "approve" },
  });
  check(
    "editor approve is 403 (role gate runs before the post lookup)",
    res.status === 403,
    `status ${res.status} — ${res.body?.error ?? res.text.slice(0, 60)}`
  );
}

{
  const editorJar = roleSessions.EDITOR.jar;
  const res = await req(editorJar, `${BASE_URL}/api/brains`, {
    method: "POST",
    json: { name: "Editor should not be able to create this" },
  });
  check(
    "editor cannot create a brain (403)",
    res.status === 403,
    `status ${res.status} — ${res.body?.error ?? res.text.slice(0, 60)}`
  );

  const media = await req(editorJar, `${BASE_URL}/api/media?id=does-not-exist`, {
    method: "DELETE",
  });
  check(
    "editor cannot delete media (403)",
    media.status === 403,
    `status ${media.status} — ${media.body?.error ?? media.text.slice(0, 60)}`
  );

  const connect = await req(editorJar, `${BASE_URL}/api/social/connect?platform=LINKEDIN`);
  check(
    "editor cannot start an account connection (403)",
    connect.status === 403,
    `status ${connect.status}`
  );
}

// ------------------------------------------------------------- editor workflow
let editorPostId = null;
{
  const editorJar = roleSessions.EDITOR.jar;
  const created = await req(editorJar, `${BASE_URL}/api/posts`, {
    method: "POST",
    json: { title: `Editor draft ${stamp}`, content: "Drafted by the editor role.", platform: "LINKEDIN" },
  });
  editorPostId = created.body?.id ?? null;
  check(
    "editor can create a draft",
    created.status === 201 && !!editorPostId,
    `status ${created.status}`
  );

  if (editorPostId) {
    const submit = await req(editorJar, `${BASE_URL}/api/posts/${editorPostId}/approve`, {
      method: "POST",
      json: { action: "submit" },
    });
    check(
      "editor can submit the draft for approval",
      submit.status === 200 && submit.body?.post?.status === "PENDING_APPROVAL",
      `status ${submit.status}/${submit.body?.post?.status}`
    );

    const approve = await req(editorJar, `${BASE_URL}/api/posts/${editorPostId}/approve`, {
      method: "POST",
      json: { action: "approve" },
    });
    check(
      "editor cannot approve their own post (403)",
      approve.status === 403,
      `status ${approve.status}`
    );
  }
}

// ------------------------------------------------------- admin full chain (mock)
{
  const adminJar = roleSessions.ADMIN.jar;

  const connect = await req(adminJar, `${BASE_URL}/api/social/connect?platform=LINKEDIN`);
  if (connect.body?.url) await req(adminJar, connect.body.url);
  const accounts = await req(adminJar, `${BASE_URL}/api/accounts`);
  const account = (accounts.body?.accounts ?? []).find((a) => a.platform === "LINKEDIN");
  check(
    "admin connects a mock LinkedIn account",
    !!account && String(account.platformUsername ?? "").startsWith("mock_"),
    account?.platformUsername ?? "none"
  );

  const created = await req(adminJar, `${BASE_URL}/api/posts`, {
    method: "POST",
    json: {
      title: `Admin publish ${stamp}`,
      content: "Role harness publish through the mock adapter.",
      platform: "LINKEDIN",
      socialAccountId: account?.id,
    },
  });
  const postId = created.body?.id;
  check("admin can create a draft", created.status === 201 && !!postId, `status ${created.status}`);

  if (postId) {
    const gate = await req(adminJar, `${BASE_URL}/api/posts/${postId}/schedule`, {
      method: "POST",
      json: { scheduledFor: new Date(Date.now() + 120_000).toISOString() },
    });
    check(
      "GATE still holds: scheduling a DRAFT is 400",
      gate.status === 400 && /must be approved/i.test(gate.body?.error ?? ""),
      `status ${gate.status}`
    );

    const approve = await req(adminJar, `${BASE_URL}/api/posts/${postId}/approve`, {
      method: "POST",
      json: { action: "approve" },
    });
    check(
      "admin can approve",
      approve.status === 200 && approve.body?.post?.status === "APPROVED",
      `status ${approve.status}`
    );

    const sched = await req(adminJar, `${BASE_URL}/api/posts/${postId}/schedule`, {
      method: "POST",
      json: { scheduledFor: new Date(Date.now() + 180_000).toISOString() },
    });
    check(
      "admin can schedule an approved post",
      sched.status === 200 && sched.body?.post?.status === "SCHEDULED",
      `status ${sched.status}`
    );
  }
}

// The scripted dev login page used to be asserted here. Its endpoint is gone from
// the app, and the check above asserts it stays gone.

// ------------------------------------------- invited roles (MANAGER, CLIENT)
// The gap this closes: no role other than ADMIN and EDITOR was reachable. Signup
// could not produce them and nothing could assign them, so they existed only in
// the role matrix. An invitation is now the way in.
{
  const adminJar = new Jar();
  await loginWithPassword(adminJar, mixedCaseEmail.toLowerCase(), password);
  const adminId = (await session(adminJar)).user?.id ?? "";

  const invitedEmail = `role.manager-${stamp}@socialorc.local`;
  const invite = await req(adminJar, `${BASE_URL}/api/workspace/invitations`, {
    method: "POST",
    json: { email: invitedEmail, role: "MANAGER" },
  });
  check(
    "an admin can invite somebody as MANAGER",
    invite.status === 201 && invite.body?.invitation?.role === "MANAGER" && !!invite.body?.token,
    `status ${invite.status}, role ${invite.body?.invitation?.role ?? "none"}`
  );

  const token = invite.body?.token ?? "";

  const managerJar = new Jar();
  const reg = await req(managerJar, `${BASE_URL}/api/auth/register`, {
    method: "POST",
    json: { name: "Invited Manager", email: invitedEmail, password, inviteToken: token },
  });
  check(
    "an invitation admits the invitee with the invited role",
    reg.status === 200 && reg.body?.role === "MANAGER",
    `status ${reg.status}, role ${reg.body?.role ?? "none"}`
  );

  const reuse = await req(new Jar(), `${BASE_URL}/api/auth/register`, {
    method: "POST",
    json: {
      name: "Spent",
      email: `role.spent-${stamp}@socialorc.local`,
      password,
      inviteToken: token,
    },
  });
  check("a spent invitation cannot be used twice", reuse.status === 403, `status ${reuse.status}`);

  await loginWithPassword(managerJar, invitedEmail, password);
  const managerPerms = (await session(managerJar)).user?.permissions ?? [];
  check(
    "the MANAGER session holds management rights but not users:manage",
    managerPerms.includes("posts:approve") &&
      managerPerms.includes("accounts:connect") &&
      !managerPerms.includes("users:manage"),
    managerPerms.join(",")
  );

  const manageUsers = await req(managerJar, `${BASE_URL}/api/workspace/users`);
  check(
    "a MANAGER cannot list the members (403)",
    manageUsers.status === 403,
    `status ${manageUsers.status}`
  );

  const list = await req(adminJar, `${BASE_URL}/api/workspace/users`);
  const manager = (list.body?.users ?? []).find((u) => u.email === invitedEmail);
  check(
    "an admin can list the members",
    list.status === 200 && !!manager,
    `status ${list.status}, ${list.body?.users?.length ?? 0} users`
  );

  const changed = await req(adminJar, `${BASE_URL}/api/workspace/users/${manager?.id}`, {
    method: "PATCH",
    json: { role: "EDITOR" },
  });
  check(
    "an admin can change a member's role",
    changed.status === 200 && changed.body?.user?.role === "EDITOR",
    `status ${changed.status}, role ${changed.body?.user?.role ?? "none"}`
  );

  const selfDemote = await req(adminJar, `${BASE_URL}/api/workspace/users/${adminId}`, {
    method: "PATCH",
    json: { role: "EDITOR" },
  });
  check(
    "an admin cannot change their own role",
    selfDemote.status === 400,
    `status ${selfDemote.status} — ${selfDemote.body?.error ?? ""}`
  );

  const otherEmail = `role.other-${stamp}@socialorc.local`;
  const wrongPerson = await req(adminJar, `${BASE_URL}/api/workspace/invitations`, {
    method: "POST",
    json: { email: `role.wrong-${stamp}@socialorc.local`, role: "EDITOR" },
  });
  const wrongUse = await req(new Jar(), `${BASE_URL}/api/auth/register`, {
    method: "POST",
    json: { name: "Wrong Person", email: otherEmail, password, inviteToken: wrongPerson.body?.token ?? "" },
  });
  check(
    "an invitation admits only the address it names",
    wrongUse.status === 403,
    `status ${wrongUse.status}`
  );
  // CLIENT is the read-only end of the matrix, reachable the same way.
  const clientEmail = `role.client-${stamp}@socialorc.local`;
  const clientInvite = await req(adminJar, `${BASE_URL}/api/workspace/invitations`, {
    method: "POST",
    json: { email: clientEmail, role: "CLIENT" },
  });
  const clientJar = new Jar();
  const clientReg = await req(clientJar, `${BASE_URL}/api/auth/register`, {
    method: "POST",
    json: {
      name: "Invited Client",
      email: clientEmail,
      password,
      inviteToken: clientInvite.body?.token ?? "",
    },
  });
  await loginWithPassword(clientJar, clientEmail, password);
  const clientPerms = (await session(clientJar)).user?.permissions ?? [];
  // CLIENT is the read-only end of the matrix. Assert the read permissions it does
  // have and, more to the point, that it holds no write permission at all — a
  // hard-coded count would break the moment a readable surface is added.
  const CLIENT_READ_PERMISSIONS = ["dashboard:view", "brains:read", "engagement:view"];
  const CLIENT_WRITE_PERMISSIONS = [
    "posts:create",
    "posts:submit",
    "posts:approve",
    "posts:schedule",
    "posts:delete",
    "accounts:connect",
    "media:upload",
    "media:delete",
    "brains:manage",
    "feed:post",
    "engagement:reply",
    "engagement:react",
    "engagement:delete",
    "users:manage",
  ];
  check(
    "a CLIENT invitation produces a session that can only look",
    clientReg.status === 200 &&
      clientReg.body?.role === "CLIENT" &&
      CLIENT_READ_PERMISSIONS.every((p) => clientPerms.includes(p)) &&
      CLIENT_WRITE_PERMISSIONS.every((p) => !clientPerms.includes(p)),
    `status ${clientReg.status}, role ${clientReg.body?.role ?? "none"}, perms ${clientPerms.join(",") || "none"}`
  );

  const clientPost = await req(clientJar, `${BASE_URL}/api/posts`, {
    method: "POST",
    json: { content: "A client must not be able to post", platform: "LINKEDIN" },
  });
  check("a CLIENT cannot create a post (403)", clientPost.status === 403, `status ${clientPost.status}`);

  const clientSchedule = await req(clientJar, `${BASE_URL}/api/posts/does-not-exist/schedule`, {
    method: "POST",
    json: { scheduledFor: new Date(Date.now() + 3_600_000).toISOString() },
  });
  check("a CLIENT cannot schedule (403)", clientSchedule.status === 403, `status ${clientSchedule.status}`);

  const clientApprove = await req(clientJar, `${BASE_URL}/api/posts/does-not-exist/approve`, {
    method: "POST",
    json: { action: "approve" },
  });
  check("a CLIENT cannot approve (403)", clientApprove.status === 403, `status ${clientApprove.status}`);
}

const failed = RESULTS.filter((r) => !r.ok);
console.log(`\n${RESULTS.length - failed.length}/${RESULTS.length} checks passed`);
if (failed.length) {
  console.log("Failed checks:");
  for (const f of failed) console.log(`  - ${f.name}${f.detail ? ` (${f.detail})` : ""}`);
}
process.exit(failed.length ? 1 : 0);
