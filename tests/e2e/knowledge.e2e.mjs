/**
 * Brand Brain knowledge sources — real HTTP against a real database.
 *
 * Proves from the outside:
 *   - with no AI key, a pasted source is stored and labelled keyword-only (BM25);
 *   - unsafe URLs (http, loopback, localhost, metadata IP) are refused before any fetch;
 *   - sources are workspace-scoped: another workspace neither sees nor deletes them (404);
 *   - a CLIENT member can list but not add or delete (403);
 *   - with a key, a source is embedded through the account's own provider, and
 *     generation puts the matching excerpt into the model prompt (semantic), and
 *     stops doing so once the source is deleted.
 *
 * The "provider" is a local fake OpenAI-compatible server started by this suite,
 * so no real key or network is used. Local http base URLs are accepted only
 * because the harness runs the app with NODE_ENV=development.
 */
import http from "node:http";

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

async function req(jar, url, { method = "GET", body, json, headers = {} } = {}) {
  const h = { ...headers };
  const cookie = jar.header();
  if (cookie) h.cookie = cookie;
  let payload = body;
  if (json !== undefined) {
    h["content-type"] = "application/json";
    payload = JSON.stringify(json);
  }
  const res = await fetch(url, { method, headers: h, body: payload, redirect: "manual" });
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

/** Bag-of-words vector: texts sharing words are close, like a (very) small model. */
function fakeVector(text, dim = 64) {
  const vec = new Array(dim).fill(0);
  for (const word of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    let h = 2166136261;
    for (let i = 0; i < word.length; i++) h = Math.imul(h ^ word.charCodeAt(i), 16777619);
    vec[(h >>> 0) % dim] += 1;
  }
  const norm = Math.hypot(...vec) || 1;
  return vec.map((v) => v / norm);
}

/** A fake OpenAI-compatible provider that records what it was asked. */
function startFakeProvider() {
  const seen = { embeddings: 0, prompts: [] };
  const server = http.createServer((request, response) => {
    let raw = "";
    request.on("data", (part) => (raw += part));
    request.on("end", () => {
      const body = raw ? JSON.parse(raw) : {};
      const send = (payload) => {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify(payload));
      };
      if (request.url?.endsWith("/embeddings")) {
        seen.embeddings++;
        const inputs = Array.isArray(body.input) ? body.input : [body.input];
        return send({
          object: "list",
          model: body.model,
          data: inputs.map((input, index) => ({ object: "embedding", index, embedding: fakeVector(input) })),
          usage: { prompt_tokens: inputs.length, total_tokens: inputs.length },
        });
      }
      if (request.url?.endsWith("/chat/completions")) {
        const system = (body.messages ?? []).find((m) => m.role === "system")?.content ?? "";
        seen.prompts.push(system);
        return send({
          id: "chatcmpl-e2e",
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: body.model,
          choices: [
            {
              index: 0,
              finish_reason: "stop",
              message: {
                role: "assistant",
                content: JSON.stringify({
                  variants: [{ platform: "LINKEDIN", content: "Grounded e2e post", hashtags: [] }],
                }),
              },
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        });
      }
      response.writeHead(404);
      response.end();
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, seen, port: server.address().port }));
  });
}

export async function runKnowledgeE2E({ baseUrl }) {
  RESULTS.length = 0;
  const stamp = Date.now();
  const password = `knowledge-pass-${stamp}`;
  const url = (path) => `${baseUrl}${path}`;

  let ipSeq = 0;
  async function signUp(label, extra = {}) {
    const jar = new Jar();
    const email = `knowledge-${label}-${stamp}@example.test`;
    const reg = await req(jar, url("/api/auth/register"), {
      method: "POST",
      json: { name: `Knowledge ${label}`, email, password, ...extra },
      // Register is rate limited per IP and every suite in the run signs up.
      headers: { "x-forwarded-for": `10.83.${Math.floor(stamp / 1000) % 250}.${++ipSeq}` },
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
    return { jar, reg };
  }

  console.log(`\nSocialOrc Brand Brain knowledge E2E — ${baseUrl}`);
  const provider = await startFakeProvider();

  try {
    const owner = await signUp("owner");
    check("owner signs up", owner.reg.status === 200, `status ${owner.reg.status}`);
    const o = owner.jar;

    const empty = await req(o, url("/api/brand-brain/sources"));
    check(
      "a new workspace has no sources and says new ones will be keyword-indexed",
      empty.status === 200 && empty.body?.sources?.length === 0 && empty.body?.indexing?.mode === "lexical" && empty.body?.canManage === true,
      JSON.stringify(empty.body?.indexing),
    );

    const lexical = await req(o, url("/api/brand-brain/sources"), {
      method: "POST",
      json: {
        kind: "text",
        title: "Pricing facts",
        text: "The Fjordline subscription costs 99 NOK per month and includes unlimited ferry bookings.",
      },
    });
    check(
      "with no key a pasted source is stored keyword-only",
      lexical.status === 201 && lexical.body?.source?.index === "lexical" && lexical.body?.source?.chunkCount >= 1,
      `status ${lexical.status} ${JSON.stringify(lexical.body)}`,
    );
    const lexicalId = lexical.body?.source?.sourceId;

    const invalid = await req(o, url("/api/brand-brain/sources"), { method: "POST", json: { kind: "text", title: "", text: "" } });
    check("an empty source is a 400", invalid.status === 400, `status ${invalid.status}`);

    for (const bad of ["http://example.com/", "https://127.0.0.1/", "https://localhost/", "https://169.254.169.254/latest/meta-data"]) {
      const res = await req(o, url("/api/brand-brain/sources"), { method: "POST", json: { kind: "url", url: bad } });
      check(`unsafe URL ${bad} is refused`, res.status === 400, `status ${res.status} ${res.body?.error ?? ""}`);
    }

    const listed = await req(o, url("/api/brand-brain/sources"));
    const row = (listed.body?.sources ?? []).find((s) => s.id === lexicalId);
    check(
      "the source is listed with its index mode and size",
      !!row && row.index === "lexical" && row.status === "ready" && row.chunkCount >= 1 && row.characters > 0,
      JSON.stringify(row),
    );

    // ------------------------------------------------ another workspace
    const intruder = await signUp("intruder");
    const theirs = await req(intruder.jar, url("/api/brand-brain/sources"));
    check(
      "another workspace does not see the sources",
      theirs.status === 200 && (theirs.body?.sources ?? []).every((s) => s.id !== lexicalId),
      `status ${theirs.status}`,
    );
    const crossDelete = await req(intruder.jar, url(`/api/brand-brain/sources/${lexicalId}`), { method: "DELETE" });
    check("cross-tenant delete is 404", crossDelete.status === 404, `status ${crossDelete.status}`);

    // ------------------------------------------------ a read-only member
    const invite = await req(o, url("/api/workspace/invitations"), {
      method: "POST",
      json: { email: `knowledge-client-${stamp}@example.test`, role: "CLIENT" },
    });
    const client = await signUp("client", { inviteToken: invite.body?.token ?? "" });
    const clientList = await req(client.jar, url("/api/brand-brain/sources"));
    check(
      "a CLIENT can list the workspace's sources but not manage them",
      clientList.status === 200 && clientList.body?.canManage === false && (clientList.body?.sources ?? []).some((s) => s.id === lexicalId),
      `status ${clientList.status} role ${client.reg.body?.role}`,
    );
    const clientAdd = await req(client.jar, url("/api/brand-brain/sources"), {
      method: "POST",
      json: { kind: "text", title: "x", text: "y" },
    });
    check("a CLIENT cannot add a source", clientAdd.status === 403, `status ${clientAdd.status}`);
    const clientDelete = await req(client.jar, url(`/api/brand-brain/sources/${lexicalId}`), { method: "DELETE" });
    check("a CLIENT cannot delete a source", clientDelete.status === 403, `status ${clientDelete.status}`);

    // ------------------------------------------------ with the account's own key
    const key = await req(o, url("/api/ai/credentials"), {
      method: "PUT",
      json: {
        scope: "user",
        kind: "text",
        provider: "openai",
        apiKey: "sk-e2e-fake-key-123456",
        baseUrl: `http://127.0.0.1:${provider.port}/v1`,
        model: "gpt-e2e",
      },
    });
    check("owner saves an AI key pointing at the fake provider", key.status === 200, `status ${key.status} ${key.text.slice(0, 200)}`);

    const semantic = await req(o, url("/api/brand-brain/sources"), {
      method: "POST",
      json: {
        kind: "text",
        title: "Sustainability report",
        text: "Our ferries switched to battery electric propulsion in 2025, cutting emissions by eighty percent.",
      },
    });
    check(
      "with a key the source is embedded by the account's provider",
      semantic.status === 201 && semantic.body?.source?.index === "semantic" && provider.seen.embeddings >= 1,
      `status ${semantic.status} ${JSON.stringify(semantic.body)}`,
    );
    const semanticId = semantic.body?.source?.sourceId;

    const generated = await req(o, url("/api/posts/generate"), {
      method: "POST",
      json: { idea: "Announce our battery electric ferries and lower emissions", platforms: ["LINKEDIN"] },
    });
    const prompt = provider.seen.prompts.at(-1) ?? "";
    check(
      "generation is grounded in the matching knowledge (semantic)",
      generated.status === 200 &&
        generated.body?.usedMock === false &&
        generated.body?.knowledgeUsed?.mode === "semantic" &&
        prompt.includes("BRAND KNOWLEDGE") &&
        prompt.includes("battery electric propulsion"),
      `status ${generated.status} ${JSON.stringify(generated.body?.knowledgeUsed)}`,
    );

    const deleted = await req(o, url(`/api/brand-brain/sources/${semanticId}`), { method: "DELETE" });
    await req(o, url(`/api/brand-brain/sources/${lexicalId}`), { method: "DELETE" });
    check("owner deletes the sources", deleted.status === 200, `status ${deleted.status}`);

    const after = await req(o, url("/api/posts/generate"), {
      method: "POST",
      json: { idea: "Announce our battery electric ferries and lower emissions", platforms: ["LINKEDIN"] },
    });
    const afterPrompt = provider.seen.prompts.at(-1) ?? "";
    check(
      "with no knowledge left the prompt has no knowledge section",
      after.status === 200 && after.body?.knowledgeUsed === null && !afterPrompt.includes("BRAND KNOWLEDGE"),
      `status ${after.status}`,
    );
  } finally {
    provider.server.close();
  }

  const failed = RESULTS.filter((r) => !r.ok);
  console.log(`\n${RESULTS.length - failed.length}/${RESULTS.length} knowledge checks passed`);
  return { ok: failed.length === 0, results: [...RESULTS] };
}
