/**
 * SocialOrc role + login regression harness.
 *
 * Proves, against a running server, that:
 *   - a browser over plain http://localhost keeps its auth cookies (the
 *     dead-tunnel NEXTAUTH_URL bug used to make them __Secure-/__Host- only),
 *   - registration normalises emails and rejects weak input,
 *   - the dev role login mints a real session for each role,
 *   - role permissions are enforced server-side (403, not just hidden UI),
 *   - the approval gate and the publish chain still work for an ADMIN.
 *
 * Usage:
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

async function loginAsRole(jar, role) {
  const token = await csrf(jar);
  const form = new URLSearchParams({
    csrfToken: token,
    devRole: role,
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

// -------------------------------------------------------------- dev role login
const roleSessions = {};
for (const role of ["ADMIN", "MANAGER", "EDITOR", "CLIENT"]) {
  const jar = new Jar();
  await loginAsRole(jar, role);
  const s = await session(jar);
  roleSessions[role] = { jar, session: s };
  check(
    `dev role login mints a ${role} session`,
    s.user?.role === role && !!s.user?.id,
    `role ${s.user?.role ?? "none"}, email ${s.user?.email ?? "none"}`
  );
}

{
  const editor = roleSessions.EDITOR.session;
  const client = roleSessions.CLIENT.session;
  check(
    "editor session omits approve/schedule permissions",
    Array.isArray(editor.user?.permissions) &&
      !editor.user.permissions.includes("posts:approve") &&
      !editor.user.permissions.includes("posts:schedule"),
    (editor.user?.permissions ?? []).join(",")
  );
  check(
    "client session is read-only",
    Array.isArray(client.user?.permissions) &&
      client.user.permissions.length === 1 &&
      client.user.permissions[0] === "dashboard:view",
    (client.user?.permissions ?? []).join(",")
  );
}

{
  const jar = new Jar();
  await loginAsRole(jar, "OWNER");
  const s = await session(jar);
  check(
    "an unknown dev role is refused (no session)",
    !s.user?.id,
    `session user ${s.user?.email ?? "none"}`
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
  const clientJar = roleSessions.CLIENT.jar;
  const res = await req(clientJar, `${BASE_URL}/api/posts`, {
    method: "POST",
    json: { content: "client should not be able to post", platform: "LINKEDIN" },
  });
  check("client cannot create a post (403)", res.status === 403, `status ${res.status}`);
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

// ------------------------------------------------------- scripted dev login page
{
  const res = await req(new Jar(), `${BASE_URL}/api/dev/login-as?role=ADMIN`);
  check(
    "GET /api/dev/login-as serves the scripted login page",
    res.status === 200 && res.text.includes("devRole") && res.text.includes("ADMIN"),
    `status ${res.status}`
  );
  const bad = await req(new Jar(), `${BASE_URL}/api/dev/login-as?role=OWNER`);
  check("GET /api/dev/login-as rejects an unknown role with 400", bad.status === 400, `status ${bad.status}`);
}

const failed = RESULTS.filter((r) => !r.ok);
console.log(`\n${RESULTS.length - failed.length}/${RESULTS.length} checks passed`);
if (failed.length) {
  console.log("Failed checks:");
  for (const f of failed) console.log(`  - ${f.name}${f.detail ? ` (${f.detail})` : ""}`);
}
process.exit(failed.length ? 1 : 0);
