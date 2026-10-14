/**
 * The shared OAuth callback (src/lib/oauth/callback.ts) and the write every
 * connect path ends in (src/lib/oauth/persist-account.ts).
 *
 * The route's real control flow runs here — the signed state cookie is minted
 * with the real encoder and verified by the real validator — while the session,
 * tenant, brain, adapter and database are stand-ins, so every refusal can be
 * shown to stop *before* a token exchange or a write.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NextRequest } from "next/server";
import { Platform } from "@prisma/client";

process.env.OAUTH_STATE_SECRET = "unit-oauth-state-secret";
process.env.TOKEN_ENCRYPTION_KEY ??= "unit-token-encryption-key-0123456789";

import { createOAuthCallback, type OAuthCallbackDeps } from "../../src/lib/oauth/callback";
import {
  persistConnectedAccount,
  type PersistAccountClient,
} from "../../src/lib/oauth/persist-account";
import { encodeStateCookie, type OAuthStateData } from "../../src/lib/oauth/state";
import { pendingCookieName, readPendingConnection } from "../../src/lib/oauth/pending-connection";
import { decrypt } from "../../src/lib/encryption";
import { createMockAdapter } from "../../src/lib/adapters/mock";
import type { AccountInfo, ConnectTarget, OAuthTokens, PlatformAdapter } from "../../src/types/platform";

const SECRET = process.env.OAUTH_STATE_SECRET!;
const USER = "user_1";
const WORKSPACE = "ws_1";
const STATE = "abc123";

function stateCookie(overrides: Partial<OAuthStateData> = {}, secret = SECRET): string {
  return encodeStateCookie(
    { userId: USER, platform: "LINKEDIN", timestamp: Date.now(), brainId: "brain_9", ...overrides },
    secret,
  );
}

function request(query: string, cookies: Record<string, string> = {}): NextRequest {
  const cookie = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
  return new NextRequest(`http://localhost:3000/api/social/x/callback?${query}`, {
    headers: cookie ? { cookie } : {},
  });
}

interface Calls {
  exchanged: string[];
  persisted: Parameters<OAuthCallbackDeps["persistConnectedAccount"]>[0][];
  connectedTargets: string[];
  brainsRequested: (string | null | undefined)[];
}

function harness(
  options: {
    platform?: Platform;
    session?: Awaited<ReturnType<OAuthCallbackDeps["resolveSessionUser"]>>;
    tenant?: Awaited<ReturnType<OAuthCallbackDeps["tenantForUser"]>>;
    targets?: ConnectTarget[];
    persistResult?: Awaited<ReturnType<OAuthCallbackDeps["persistConnectedAccount"]>>;
    exchange?: (code: string) => Promise<OAuthTokens>;
  } = {},
) {
  const platform = options.platform ?? Platform.LINKEDIN;
  const calls: Calls = { exchanged: [], persisted: [], connectedTargets: [], brainsRequested: [] };
  const base = createMockAdapter(platform);
  const adapter = Object.create(base) as PlatformAdapter;
  adapter.exchangeCodeForTokens = async (code: string) => {
    calls.exchanged.push(code);
    if (options.exchange) return options.exchange(code);
    return { accessToken: "user-access-token", expiresAt: new Date(Date.now() + 3_600_000), scope: "a b" };
  };
  adapter.getAccountInfo = async (): Promise<AccountInfo> => ({
    platformUserId: "platform-user-1",
    platformUsername: "someone",
  });
  if (options.targets) {
    const targets = options.targets;
    adapter.listConnectTargets = async () => targets;
    adapter.connectTarget = async (_token: string, targetId: string) => {
      calls.connectedTargets.push(targetId);
      return {
        tokens: { accessToken: `page-token-${targetId}` },
        info: { platformUserId: targetId, displayName: `Page ${targetId}` },
      };
    };
  }

  const deps: Partial<OAuthCallbackDeps> = {
    resolveSessionUser: async () => options.session ?? { ok: true, userId: USER },
    tenantForUser: async (userId) =>
      options.tenant ?? { ok: true, userId, role: "ADMIN", workspaceId: WORKSPACE },
    resolveBrainForWorkspace: async (_tenant, brainId) => {
      calls.brainsRequested.push(brainId);
      return { id: brainId ?? "brain_default" };
    },
    getAdapter: () => adapter,
    persistConnectedAccount: async (input) => {
      calls.persisted.push(input);
      return options.persistResult ?? { ok: true, accountId: "acct_1" };
    },
  };
  return { GET: createOAuthCallback(platform, deps), calls };
}

function redirectOf(res: Response): URL {
  assert.ok([302, 303, 307, 308].includes(res.status), `expected a redirect, got ${res.status}`);
  return new URL(res.headers.get("location")!);
}

describe("OAuth callback: who may finish a connection", () => {
  it("sends a caller with no session to sign in, without exchanging the code", async () => {
    const { GET, calls } = harness({ session: { ok: false, code: "UNAUTHENTICATED" } });
    const res = await GET(request(`code=c&state=${STATE}`, { [`oauth_state_${STATE}`]: stateCookie() }));
    const to = redirectOf(res);
    assert.equal(to.pathname, "/login");
    assert.equal(to.searchParams.get("error"), "unauthorized");
    assert.deepEqual(calls.exchanged, []);
  });

  it("treats a session from another database as expired", async () => {
    const { GET } = harness({ session: { ok: false, code: "UNKNOWN_USER" } });
    const to = redirectOf(await GET(request(`code=c&state=${STATE}`)));
    assert.equal(to.searchParams.get("error"), "session_expired");
  });

  it("refuses a user with no workspace after the state checks, before any exchange", async () => {
    const { GET, calls } = harness({ tenant: { ok: false, status: 403, error: "no workspace" } });
    const to = redirectOf(await GET(request(`code=c&state=${STATE}`, { [`oauth_state_${STATE}`]: stateCookie() })));
    assert.equal(to.searchParams.get("error"), "no_workspace");
    assert.deepEqual(calls.exchanged, []);
    assert.deepEqual(calls.persisted, []);
  });
});

describe("OAuth callback: state verification", () => {
  const cases: { name: string; cookie: string | null; expected: string }[] = [
    { name: "no state cookie at all", cookie: null, expected: "invalid_state" },
    { name: "a cookie signed with another secret", cookie: stateCookie({}, "attacker-secret"), expected: "invalid_state" },
    { name: "an unsigned JSON cookie", cookie: Buffer.from(JSON.stringify({ userId: USER })).toString("base64url"), expected: "invalid_state" },
    { name: "a cookie minted for another user", cookie: stateCookie({ userId: "someone_else" }), expected: "state_mismatch" },
    { name: "a cookie minted for another platform", cookie: stateCookie({ platform: "TWITTER" }), expected: "state_mismatch" },
    { name: "an expired cookie", cookie: stateCookie({ timestamp: Date.now() - 11 * 60_000 }), expected: "state_expired" },
  ];

  for (const c of cases) {
    it(`rejects ${c.name} and never exchanges the code`, async () => {
      const { GET, calls } = harness();
      const cookies: Record<string, string> = c.cookie ? { [`oauth_state_${STATE}`]: c.cookie } : {};
      const to = redirectOf(await GET(request(`code=c&state=${STATE}`, cookies)));
      assert.equal(to.pathname, "/settings/accounts");
      assert.equal(to.searchParams.get("error"), c.expected);
      assert.deepEqual(calls.exchanged, []);
      assert.deepEqual(calls.persisted, []);
    });
  }

  it("a valid cookie under a different state name does not count", async () => {
    const { GET, calls } = harness();
    const to = redirectOf(await GET(request(`code=c&state=${STATE}`, { oauth_state_other: stateCookie() })));
    assert.equal(to.searchParams.get("error"), "invalid_state");
    assert.deepEqual(calls.exchanged, []);
  });

  it("reports missing code/state, and the provider's own refusal", async () => {
    const { GET } = harness();
    assert.equal(redirectOf(await GET(request(`state=${STATE}`))).searchParams.get("error"), "missing_params");
    assert.equal(redirectOf(await GET(request("code=c"))).searchParams.get("error"), "missing_params");
    const declined = redirectOf(await GET(request("error=access_denied&error_description=User%20said%20no")));
    assert.equal(declined.searchParams.get("error"), "User said no");
  });

  it("keeps a popup flow a popup even when it fails", async () => {
    const { GET } = harness();
    const to = redirectOf(
      await GET(request(`state=${STATE}`, { [`oauth_state_${STATE}`]: stateCookie({ popup: true }) })),
    );
    assert.equal(to.searchParams.get("popup"), "1");
  });
});

describe("OAuth callback: a single identity is connected directly", () => {
  it("exchanges, stores in the caller's workspace and brain, and clears the state cookie", async () => {
    const { GET, calls } = harness();
    const res = await GET(request(`code=the-code&state=${STATE}`, { [`oauth_state_${STATE}`]: stateCookie() }));
    const to = redirectOf(res);
    assert.equal(to.searchParams.get("success"), "linkedin_connected");
    assert.equal(to.searchParams.get("account"), "acct_1");
    assert.equal(to.searchParams.get("brain"), "brain_9");
    assert.deepEqual(calls.exchanged, ["the-code"]);
    assert.equal(calls.persisted.length, 1);
    const saved = calls.persisted[0];
    assert.equal(saved.workspaceId, WORKSPACE);
    assert.equal(saved.userId, USER);
    assert.equal(saved.brainId, "brain_9");
    assert.equal(saved.info.platformUserId, "platform-user-1");
    assert.equal(res.cookies.get(`oauth_state_${STATE}`)?.value, "", "the used state cookie is deleted");
  });

  it("refuses an account another workspace owns, and says so without a raw error", async () => {
    const { GET } = harness({ persistResult: { ok: false, reason: "account_owned_elsewhere" } });
    const to = redirectOf(await GET(request(`code=c&state=${STATE}`, { [`oauth_state_${STATE}`]: stateCookie() })));
    assert.equal(to.searchParams.get("error"), "account_owned_elsewhere");
    assert.equal(to.searchParams.get("success"), null);
  });

  it("collapses an adapter failure to a stable code (no provider text in the URL)", async () => {
    const { GET } = harness({
      exchange: async () => {
        throw new Error("token endpoint said: secret=abc123 invalid");
      },
    });
    const to = redirectOf(await GET(request(`code=c&state=${STATE}`, { [`oauth_state_${STATE}`]: stateCookie() })));
    assert.equal(to.searchParams.get("error"), "linkedin_connect_failed");
    assert.doesNotMatch(to.toString(), /secret/);
  });
});

describe("OAuth callback: grants that cover several Pages", () => {
  const fbCookie = () => ({
    [`oauth_state_${STATE}`]: stateCookie({ platform: "FACEBOOK" }),
  });

  it("connects the only Page directly", async () => {
    const { GET, calls } = harness({ platform: Platform.FACEBOOK, targets: [{ id: "page_1", name: "One" }] });
    const to = redirectOf(await GET(request(`code=c&state=${STATE}`, fbCookie())));
    assert.equal(to.searchParams.get("success"), "facebook_connected");
    assert.deepEqual(calls.connectedTargets, ["page_1"]);
    assert.equal(calls.persisted[0].info.platformUserId, "page_1");
    assert.equal(calls.persisted[0].tokens.accessToken, "page-token-page_1");
  });

  it("parks a multi-Page grant in a signed, encrypted cookie and stores nothing yet", async () => {
    const { GET, calls } = harness({
      platform: Platform.FACEBOOK,
      targets: [
        { id: "page_1", name: "One" },
        { id: "page_2", name: "Two" },
      ],
    });
    const res = await GET(request(`code=c&state=${STATE}`, fbCookie()));
    const to = redirectOf(res);
    assert.equal(to.searchParams.get("select"), "facebook");
    assert.equal(to.searchParams.get("brain"), "brain_9");
    assert.deepEqual(calls.persisted, [], "nothing is stored until the user chooses");
    assert.deepEqual(calls.connectedTargets, []);
    assert.equal(res.cookies.get(`oauth_state_${STATE}`)?.value, "");

    const raw = res.cookies.get(pendingCookieName("FACEBOOK"))?.value;
    assert.ok(raw, "pending cookie is set");
    assert.doesNotMatch(raw!, /user-access-token/, "the token is never in the clear");
    assert.doesNotMatch(Buffer.from(raw!.split(".")[1], "base64url").toString("utf8"), /user-access-token/);

    const mine = readPendingConnection(raw, { userId: USER, workspaceId: WORKSPACE, platform: "FACEBOOK", secret: SECRET });
    assert.equal(mine.ok, true);
    if (mine.ok) {
      assert.equal(mine.data.userToken, "user-access-token");
      assert.equal(mine.data.brainId, "brain_9");
    }
    const theirs = readPendingConnection(raw, { userId: "someone_else", workspaceId: WORKSPACE, platform: "FACEBOOK", secret: SECRET });
    assert.deepEqual(theirs, { ok: false, reason: "user_mismatch" });
    const otherPlatform = readPendingConnection(raw, { userId: USER, workspaceId: WORKSPACE, platform: "INSTAGRAM", secret: SECRET });
    assert.deepEqual(otherPlatform, { ok: false, reason: "platform_mismatch" });
    const otherWorkspace = readPendingConnection(raw, { userId: USER, workspaceId: "ws_other", platform: "FACEBOOK", secret: SECRET });
    assert.equal(otherWorkspace.ok, false, "a grant parked for one workspace is not usable from another");
  });

  it("says so when the grant covers nothing publishable", async () => {
    const { GET, calls } = harness({ platform: Platform.INSTAGRAM, targets: [] });
    const to = redirectOf(
      await GET(request(`code=c&state=${STATE}`, { [`oauth_state_${STATE}`]: stateCookie({ platform: "INSTAGRAM" }) })),
    );
    assert.match(to.searchParams.get("error") ?? "", /No Instagram professional account/);
    assert.deepEqual(calls.persisted, []);
  });
});

// ------------------------------------------------------------------ persist

function fakeClient(existing: { id: string; workspaceId: string | null } | null) {
  const upserts: { create: Record<string, unknown>; update: Record<string, unknown> }[] = [];
  const client: PersistAccountClient = {
    socialAccount: {
      findUnique: async () => existing,
      upsert: async (args) => {
        upserts.push({ create: args.create, update: args.update });
        return { id: existing?.id ?? "new_acct" };
      },
    },
  };
  return { client, upserts };
}

const persistInput = (adapter: PlatformAdapter = createMockAdapter(Platform.FACEBOOK)) => ({
  platform: Platform.FACEBOOK,
  workspaceId: WORKSPACE,
  userId: USER,
  brainId: "brain_9",
  adapter,
  tokens: { accessToken: "plain-access", refreshToken: "plain-refresh", scope: "pages_manage_posts,pages_show_list" },
  info: {
    platformUserId: "page_1",
    platformUsername: "page",
    metadata: { accountType: "page", pageAccessToken: "plaintext-page-token", externalParentId: "biz_1" },
  } as AccountInfo,
});

describe("persistConnectedAccount", () => {
  it("creates a new connection in the caller's workspace with encrypted tokens", async () => {
    const { client, upserts } = fakeClient(null);
    const result = await persistConnectedAccount(persistInput(), client);
    assert.deepEqual(result, { ok: true, accountId: "new_acct" });
    assert.equal(upserts.length, 1);
    const { create } = upserts[0];
    assert.equal(create.workspaceId, WORKSPACE);
    assert.equal(create.userId, USER);
    assert.equal(create.brainId, "brain_9");
    assert.equal(create.platform, Platform.FACEBOOK);
    assert.notEqual(create.accessToken, "plain-access");
    assert.equal(decrypt(create.accessToken as string), "plain-access");
    assert.equal(decrypt(create.refreshToken as string), "plain-refresh");
    assert.equal(create.needsReconnect, false);
    assert.equal(create.externalParentId, "biz_1");
    assert.doesNotMatch(JSON.stringify(create.metadata ?? {}), /plaintext-page-token/, "plaintext page tokens are dropped");
  });

  it("lets a teammate reconnect the workspace's own account without rewriting ownership", async () => {
    const { client, upserts } = fakeClient({ id: "acct_7", workspaceId: WORKSPACE });
    const result = await persistConnectedAccount({ ...persistInput(), userId: "teammate" }, client);
    assert.deepEqual(result, { ok: true, accountId: "acct_7" });
    assert.equal(upserts[0].update.userId, undefined);
    assert.equal(upserts[0].update.workspaceId, undefined);
    assert.equal(upserts[0].update.brainId, "brain_9");
  });

  it("refuses an account another workspace connected, and writes nothing", async () => {
    const { client, upserts } = fakeClient({ id: "acct_7", workspaceId: "ws_other" });
    const result = await persistConnectedAccount(persistInput(), client);
    assert.deepEqual(result, { ok: false, reason: "account_owned_elsewhere" });
    assert.equal(upserts.length, 0);
  });

  it("stores a capability snapshot from the granted scopes, and survives a failing one", async () => {
    const seen: string[][] = [];
    const adapter = Object.create(createMockAdapter(Platform.FACEBOOK)) as PlatformAdapter;
    adapter.getCapabilities = ({ scopes }) => {
      seen.push(scopes);
      return { capabilities: { publishText: true }, limitations: [] } as unknown as ReturnType<
        NonNullable<PlatformAdapter["getCapabilities"]>
      >;
    };
    const { client, upserts } = fakeClient(null);
    await persistConnectedAccount(persistInput(adapter), client);
    assert.deepEqual(seen, [["pages_manage_posts", "pages_show_list"]]);
    assert.equal(upserts[0].create.scopes, "pages_manage_posts,pages_show_list");
    assert.ok((upserts[0].create.capabilities as { computedAt?: string }).computedAt);

    const broken = Object.create(createMockAdapter(Platform.FACEBOOK)) as PlatformAdapter;
    broken.getCapabilities = () => {
      throw new Error("boom");
    };
    const second = fakeClient(null);
    const result = await persistConnectedAccount(persistInput(broken), second.client);
    assert.equal(result.ok, true);
    assert.equal(second.upserts[0].create.capabilities, undefined);
  });
});
