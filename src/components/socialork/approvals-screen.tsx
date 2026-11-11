"use client";

/**
 * Approvals with the design's two modes: the Queue (the existing board, every
 * feature unchanged) and Quick review, one post at a time with keyboard keys.
 * Every decision still goes through /api/posts/[id]/approve and /schedule, so
 * the server keeps enforcing roles, the no-self-approval rule and the audit.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApprovalsBoard, type ApprovalPost } from "@/components/socialork/approvals-board";
import { PLATFORM_CONFIGS } from "@/types/platform";
import { showToast } from "@/components/socialork/undo-toast";

type Check = { ok: boolean; label: string };

const REASONS = [
  "Too long for the channel",
  "Off-brand tone",
  "Needs an image or video",
  "Fact or link needs checking",
];

/** Tomorrow at 09:00 local, as a datetime-local value. */
function defaultSlot(): string {
  const d = new Date(Date.now() + 864e5);
  d.setHours(9, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function checksFor(p: ApprovalPost, viewerId: string, solo: boolean): Check[] {
  const cfg = PLATFORM_CONFIGS[p.platform];
  const out: Check[] = [];
  const len = p.content.length;
  if (cfg) {
    out.push({ ok: len <= cfg.maxTextLength, label: `${len.toLocaleString()} / ${cfg.maxTextLength.toLocaleString()} characters for ${cfg.name}` });
    const media = p.mediaCount ?? 0;
    if (cfg.capabilities.mediaRequired) out.push({ ok: media > 0, label: media > 0 ? `${media} media attached` : `${cfg.name} needs an image or video` });
    else if (media > cfg.maxMediaCount) out.push({ ok: false, label: `${cfg.name} takes at most ${cfg.maxMediaCount} attachment${cfg.maxMediaCount === 1 ? "" : "s"}` });
  }
  out.push({ ok: Boolean(p.handle), label: p.handle ? `Posts as ${p.handle}` : "No account chosen yet" });
  if (p.authorId === viewerId) out.push({ ok: solo, label: solo ? "Your own post · allowed, you are the only member" : "Your own post · another manager must approve it" });
  return out;
}

export type AuditItem = { id: string; label: string; actor: string; subject: string; at: string; ok: boolean };

export function ApprovalsScreen({ posts, canApprove, viewerId, solo, audit, clientSignOff }: { posts: ApprovalPost[]; canApprove: boolean; viewerId: string; solo: boolean; audit: AuditItem[]; clientSignOff: boolean }) {
  const [mode, setMode] = useState<"queue" | "quick" | "audit">("quick");
  const [signOff, setSignOff] = useState(clientSignOff);
  async function toggleSignOff() {
    const next = !signOff;
    setSignOff(next);
    const r = await fetch("/api/approvals/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ clientSignOff: next }) });
    if (!r.ok) setSignOff(!next);
  }
  const pending = posts.filter((p) => p.status === "PENDING_APPROVAL");

  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("mode") === "queue") setMode("queue");
  }, []);

  return (
    <>
      <div className="so-spread" style={{ alignItems: "flex-end" }}>
        <div style={{ display: "grid", gap: 4 }}>
          <h1 className="so-h1">Approvals</h1>
          <p className="so-sub">
            Every post needs a recorded approval before it can be scheduled. Editing a post clears its approval.
          </p>
        </div>
        <div role="tablist" aria-label="Approvals mode" style={{ display: "flex", padding: 2, border: "1px solid var(--line)", borderRadius: 8, background: "var(--panel)" }}>
          {([["quick", "Quick review", pending.length], ["queue", "Review queue", null], ["audit", "Audit trail", null]] as const).map(([id, label, n]) => (
            <button key={id} role="tab" aria-selected={mode === id} onClick={() => setMode(id)}
              style={{ height: 28, padding: "0 12px", border: 0, borderRadius: 6, fontSize: 12.5, fontWeight: 500, cursor: "pointer",
                background: mode === id ? "var(--panel2)" : "transparent", color: mode === id ? "var(--text)" : "var(--text2)" }}>
              {label}{n ? <span className="so-mono" style={{ marginLeft: 6, fontSize: 11, color: "var(--text3)" }}>{n}</span> : null}
            </button>
          ))}
        </div>
      </div>
      <div className="so-card so-card-pad" style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 13 }}>
        <button type="button" role="switch" aria-checked={signOff} aria-label="Require client sign-off" disabled={!canApprove} onClick={toggleSignOff}
          style={{ width: 36, height: 22, flex: "none", position: "relative", border: 0, borderRadius: 11, background: signOff ? "var(--accent)" : "var(--panel2)" }}>
          <span style={{ position: "absolute", top: 2, left: signOff ? 16 : 2, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
        </button>
        <span><b>Require the client&apos;s sign-off.</b> <span style={{ color: "var(--text3)" }}>When on, only the client&apos;s approval from their review link approves a post. Your team cannot approve it for them.</span></span>
      </div>
      {mode === "queue" ? (
        <ApprovalsBoard posts={posts} canApprove={canApprove} />
      ) : mode === "quick" ? (
        <QuickReview posts={pending} canApprove={canApprove} viewerId={viewerId} solo={solo} signOff={signOff} />
      ) : (
        <section className="so-card" data-testid="audit-trail">
          {audit.length === 0 ? <div className="so-empty">No decisions recorded yet.</div> : audit.map((a, i) => (
            <div key={a.id} style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "baseline", padding: "10px 18px", borderTop: i ? "1px solid var(--line)" : 0, fontSize: 12.5 }}>
              <span className="so-mono" style={{ width: 150, flex: "none", fontSize: 11.5, color: "var(--text3)" }}>{a.at}</span>
              <span style={{ width: 170, flex: "none", fontWeight: 500, color: a.ok ? undefined : "var(--red)" }}>{a.label}</span>
              <span style={{ width: 170, flex: "none", color: "var(--text2)" }}>{a.actor}</span>
              <span style={{ flex: 1, minWidth: 0 }}>{a.subject}</span>
            </div>
          ))}
        </section>
      )}
    </>
  );
}

const REVISIONS: [string, string][] = [
  ["Fix everything", "Fix grammar, clarity and tone. Keep the meaning and every fact unchanged."],
  ["Shorter", "Make it about 30% shorter. Keep every fact."],
  ["Punchier hook", "Rewrite the first line as a stronger hook. Keep the rest and every fact."],
  ["Friendlier", "Make the tone warmer and friendlier. Keep every fact."],
  ["More formal", "Make the tone more formal and professional. Keep every fact."],
  ["Add a CTA", "Add one clear call to action at the end. Do not add new facts."],
];

function QuickReview({ posts, canApprove, viewerId, solo, signOff }: { posts: ApprovalPost[]; canApprove: boolean; viewerId: string; solo: boolean; signOff: boolean }) {
  const router = useRouter();
  const [done, setDone] = useState<Record<string, "approved" | "returned" | "skipped">>({});
  const [index, setIndex] = useState(0);
  const [sendBack, setSendBack] = useState(false);
  const [reason, setReason] = useState("");
  const [slot, setSlot] = useState(defaultSlot);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ err: boolean; text: string } | null>(null);
  const changed = useRef(false);
  const [revised, setRevised] = useState<Record<string, string>>({});

  const queue = useMemo(() => posts.filter((p) => !done[p.id] || done[p.id] === "skipped"), [posts, done]);
  const order = useMemo(() => {
    // Skipped posts go to the back of the line.
    const fresh = queue.filter((p) => !done[p.id]);
    const skipped = queue.filter((p) => done[p.id] === "skipped");
    return [...fresh, ...skipped];
  }, [queue, done]);
  const base = order[Math.min(index, Math.max(order.length - 1, 0))] ?? null;
  const current = useMemo(() => (base && revised[base.id] ? { ...base, content: revised[base.id] } : base), [base, revised]);
  const checks = current ? checksFor(current, viewerId, solo) : [];
  const blocked = current ? current.authorId === viewerId && !solo : false;

  // Refresh the server lists once the reviewer leaves, so the Queue tab is current.
  useEffect(() => () => { if (changed.current) router.refresh(); }, [router]);

  const decide = useCallback(async (action: "approve" | "reject", opts: { reason?: string; schedule?: boolean } = {}) => {
    if (!current || busy || !canApprove) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch(`/api/posts/${current.id}/approve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(action === "approve" ? { action } : { action, reason: opts.reason }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) { setNote({ err: true, text: data.error ?? `Request failed (${res.status}).` }); return; }
      changed.current = true;
      let text = action === "approve" ? "Approved." : "Sent back to the author.";
      if (action === "approve" && opts.schedule) {
        const s = await fetch(`/api/posts/${current.id}/schedule`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ scheduledFor: new Date(slot).toISOString() }),
        });
        const sd = (await s.json().catch(() => ({}))) as { error?: string };
        text = s.ok ? `Approved and scheduled for ${new Date(slot).toLocaleString()}.` : `Approved, but not scheduled: ${sd.error ?? `error ${s.status}`}`;
      }
      if (action === "reject") {
        const id = current.id;
        showToast("Sent back to the author.", async () => {
          await fetch(`/api/posts/${id}/approve`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "submit" }) });
          setDone((d) => { const n = { ...d }; delete n[id]; return n; });
          changed.current = true;
        });
      }
      setDone((d) => ({ ...d, [current.id]: action === "approve" ? "approved" : "returned" }));
      setSendBack(false);
      setReason("");
      setNote({ err: false, text });
    } catch {
      setNote({ err: true, text: "Network error — nothing was changed." });
    } finally {
      setBusy(false);
    }
  }, [current, busy, canApprove, slot]);

  async function revise(instruction: string) {
    if (!current || busy) return;
    setBusy(true);
    setNote({ err: false, text: "Revising…" });
    try {
      const ai = await fetch("/api/posts/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "improve", content: current.content, platform: current.platform, instruction }) });
      const aj = (await ai.json().catch(() => ({}))) as { content?: string; usedMock?: boolean; error?: string };
      if (!ai.ok || !aj.content) { setNote({ err: true, text: aj.error ?? "The AI could not revise this post." }); return; }
      const save = await fetch(`/api/posts/${current.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: aj.content }) });
      if (!save.ok) { setNote({ err: true, text: "The revision could not be saved." }); return; }
      // Editing clears approval and returns the post to draft; put it back in review.
      await fetch(`/api/posts/${current.id}/approve`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "submit" }) });
      changed.current = true;
      setRevised((r) => ({ ...r, [current.id]: aj.content! }));
      setNote({ err: false, text: aj.usedMock ? "Revised with sample text (no AI key yet) and kept in review." : "Revised and kept in review." });
    } catch {
      setNote({ err: true, text: "Network error. Nothing was changed." });
    } finally { setBusy(false); }
  }

  async function batchApprove(list: ApprovalPost[]) {
    setBusy(true);
    let ok = 0;
    for (const p of list) {
      const r = await fetch(`/api/posts/${p.id}/approve`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "approve" }) });
      if (r.ok) { ok++; setDone((d) => ({ ...d, [p.id]: "approved" })); }
    }
    if (ok) changed.current = true;
    setNote({ err: ok < list.length, text: `Approved ${ok} of ${list.length}.` });
    setBusy(false);
  }

  async function previewClient() {
    if (!current) return;
    const r = await fetch(`/api/posts/${current.id}/review-link`, { method: "POST" });
    const j = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!r.ok || !j.url) return setNote({ err: true, text: j.error ?? "Could not create the link." });
    window.open(j.url, "_blank", "noopener");
    try { await navigator.clipboard.writeText(j.url); setNote({ err: false, text: "Opened the client's page. The link is copied; it expires in 72 hours." }); } catch { setNote({ err: false, text: "Opened the client's page." }); }
  }

  const skip = useCallback(() => {
    if (!current) return;
    setDone((d) => ({ ...d, [current.id]: "skipped" }));
    setIndex(0);
    setSendBack(false);
    setNote(null);
  }, [current]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (!current || busy) return;
      const k = e.key.toLowerCase();
      if (sendBack) {
        if (e.key === "Escape") { e.preventDefault(); setSendBack(false); }
        const n = Number(e.key);
        if (n >= 1 && n <= REASONS.length) { e.preventDefault(); void decide("reject", { reason: REASONS[n - 1] }); }
        return;
      }
      if (k === "a" && canApprove && !blocked) { e.preventDefault(); void decide("approve"); }
      else if (e.key === "Enter" && canApprove && !blocked && (e.target as HTMLElement | null)?.tagName !== "BUTTON") { e.preventDefault(); void decide("approve", { schedule: true }); }
      else if (k === "x" && canApprove) { e.preventDefault(); setSendBack(true); }
      else if (k === "j") { e.preventDefault(); skip(); }
      else if (k === "e") { e.preventDefault(); router.push(`/socialork/drafts/${current.id}`); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, busy, sendBack, canApprove, blocked, decide, skip, router]);

  const handled = Object.values(done).filter((v) => v !== "skipped").length;
  const kbd = (k: string) => <span className="so-mono" style={{ padding: "2px 6px", border: "1px solid var(--line2)", borderBottomWidth: 2, borderRadius: 4, fontSize: 10.5, color: "var(--text2)" }}>{k}</span>;

  if (!current) {
    return (
      <section className="so-card so-card-pad" style={{ textAlign: "center", display: "grid", gap: 8, padding: "40px 20px" }}>
        <div style={{ fontWeight: 600, fontSize: 15 }}>Nothing waiting</div>
        <div style={{ color: "var(--text2)" }}>{handled ? `You handled ${handled} post${handled === 1 ? "" : "s"}. ` : ""}Every post in review has been handled.</div>
        {note ? <div style={{ fontSize: 12, color: note.err ? "var(--red)" : "var(--text3)" }}>{note.text}</div> : null}
      </section>
    );
  }

  const cfg = PLATFORM_CONFIGS[current.platform];
  const position = order.indexOf(current) + 1;
  return (
    <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
      <section className="so-card" style={{ flex: "999 1 520px", minWidth: 0, display: "flex", flexDirection: "column" }}>
        <div className="so-row" style={{ padding: "12px 18px", borderBottom: "1px solid var(--line)", flexWrap: "wrap", gap: 10 }}>
          <span className="so-mono" style={{ fontSize: 12, color: "var(--text2)", whiteSpace: "nowrap" }}>{position} / {order.length}</span>
          <div role="progressbar" aria-valuemin={0} aria-valuemax={order.length} aria-valuenow={position} style={{ flex: 1, minWidth: 60, height: 6, borderRadius: 999, background: "var(--panel2)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${(position / Math.max(order.length, 1)) * 100}%`, background: "var(--accent)", borderRadius: 999, transition: "width .5s cubic-bezier(.2,.7,.2,1)" }} />
          </div>
          <span style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11.5, color: "var(--text3)", flexWrap: "wrap" }}>
            Keys: {kbd("A")} approve · {kbd("↵")} approve + schedule · {kbd("X")} send back · {kbd("J")} skip · {kbd("E")} edit
          </span>
        </div>
        <div style={{ padding: "18px 20px", display: "grid", gap: 12 }}>
          <div className="so-row" style={{ gap: 8, flexWrap: "wrap" }}>
            <span className="so-pill">{cfg?.name ?? current.platform}</span>
            <span className="so-mono" style={{ fontSize: 11.5, color: "var(--text3)" }}>{current.handle ?? "no account"} · by {current.author ?? "a teammate"} · {current.changed}</span>
          </div>
          <div style={{ fontWeight: 600, fontSize: 17, letterSpacing: "-0.01em" }}>{current.title ?? "Untitled post"}</div>
          <div dir="auto" style={{ whiteSpace: "pre-wrap", lineHeight: 1.65, fontSize: 14, padding: 14, border: "1px solid var(--line)", borderRadius: 10, background: "var(--bg)", maxHeight: 360, overflowY: "auto", overflowWrap: "anywhere" }}>{current.content}</div>
          {current.rejectionReason ? <div className="so-frame" style={{ fontSize: 12 }}><b style={{ color: "var(--red)" }}>Earlier request:</b> {current.rejectionReason}</div> : null}
        </div>

        {canApprove ? (
          <div data-testid="revise" style={{ padding: "0 20px 14px", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "var(--text3)" }}>Revise with AI</span>
            {REVISIONS.map(([label, ins]) => <button key={label} type="button" className="so-btn" style={{ height: 28 }} disabled={busy} onClick={() => void revise(ins)}>{label}</button>)}
            <button type="button" className="so-btn" data-variant="ghost" style={{ height: 28, marginLeft: "auto" }} onClick={() => void previewClient()}>Preview the client&apos;s page</button>
          </div>
        ) : null}

        {sendBack ? (
          <div style={{ padding: "0 20px 16px", display: "grid", gap: 8 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600 }}>Why is it going back? One click sends it.</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {REASONS.map((r, i) => (
                <button key={r} className="so-btn" style={{ height: 30 }} disabled={busy} onClick={() => void decide("reject", { reason: r })}>
                  <span className="so-mono" style={{ fontSize: 10.5, color: "var(--text3)" }}>{i + 1}</span> {r}
                </button>
              ))}
            </div>
            <div className="so-row" style={{ gap: 8 }}>
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Or write your own note…" maxLength={500}
                onKeyDown={(e) => { if (e.key === "Enter" && reason.trim()) { e.preventDefault(); void decide("reject", { reason: reason.trim() }); } }}
                style={{ flex: 1, height: 32, padding: "0 10px", borderRadius: 8, border: "1px solid var(--line2)", background: "var(--bg)", color: "var(--text)", fontSize: 12.5, outline: "none" }} />
              <button className="so-btn" style={{ height: 32 }} disabled={busy || !reason.trim()} onClick={() => void decide("reject", { reason: reason.trim() })}>Send back</button>
              <button className="so-btn" data-variant="ghost" style={{ height: 32 }} onClick={() => setSendBack(false)}>Cancel</button>
            </div>
          </div>
        ) : null}

        <div className="so-row" style={{ padding: "14px 20px", borderTop: "1px solid var(--line)", gap: 8, flexWrap: "wrap" }}>
          <span style={{ flex: 1, fontSize: 12, color: note?.err ? "var(--red)" : "var(--text3)", minWidth: 200 }}>
            {note?.text ?? (canApprove ? (blocked ? "This is your post. Another manager must approve it." : "Approving does not publish. Scheduling is a separate step.") : "Your role can review but not decide.")}
          </span>
          {canApprove ? (
            <>
              <button className="so-btn" style={{ height: 34 }} disabled={busy} onClick={() => setSendBack((v) => !v)}>Send back</button>
              <button className="so-btn" data-variant="ghost" style={{ height: 34 }} disabled={busy} onClick={skip}>Skip</button>
              <Link className="so-btn" data-variant="ghost" style={{ height: 34 }} href={`/socialork/drafts/${current.id}`}>Edit</Link>
              <button className="so-btn" data-variant="primary" style={{ height: 34 }} disabled={busy || blocked || signOff} title={signOff ? "Client sign-off is required" : undefined} onClick={() => void decide("approve")}>Approve</button>
            </>
          ) : (
            <button className="so-btn" style={{ height: 34 }} onClick={skip}>Next</button>
          )}
        </div>
      </section>

      <div style={{ flex: "1 1 280px", minWidth: 0, display: "grid", gap: 12 }}>
        <section className="so-card so-card-pad" style={{ display: "grid", gap: 8 }}>
          <div className="so-spread" style={{ alignItems: "baseline" }}>
            <span className="so-stat-label">AI check</span>
            <span className="so-mono" style={{ fontSize: 11, color: "var(--text3)" }}>{checks.filter((c) => c.ok).length} of {checks.length} checks pass</span>
          </div>
          {checks.map((c) => (
            <div key={c.label} className="so-row" style={{ gap: 8, fontSize: 12.5, alignItems: "flex-start" }}>
              <span style={{ width: 8, height: 8, marginTop: 5, flex: "none", borderRadius: "50%", background: c.ok ? "var(--green)" : "var(--amber)" }} />
              <span style={{ color: c.ok ? "var(--text2)" : "var(--text)" }}>{c.label}</span>
            </div>
          ))}
        </section>
        {canApprove && !blocked ? (
          <section className="so-card so-card-pad" style={{ display: "grid", gap: 8 }}>
            <span className="so-stat-label">Approve + schedule ({kbd("↵")})</span>
            <input type="datetime-local" value={slot} onChange={(e) => setSlot(e.target.value)} aria-label="Schedule time"
              style={{ height: 32, padding: "0 8px", borderRadius: 8, border: "1px solid var(--line2)", background: "var(--panel2)", color: "var(--text)", fontSize: 12.5 }} />
            <button className="so-btn" data-variant="primary" style={{ height: 32 }} disabled={busy} onClick={() => void decide("approve", { schedule: true })}>Approve and schedule</button>
            <span style={{ fontSize: 11.5, color: "var(--text3)" }}>Scheduling needs the schedule permission; if your role lacks it, the post stays approved.</span>
          </section>
        ) : null}
        {canApprove && !signOff ? (() => {
          const ready = order.filter((p) => !done[p.id] && checksFor(p, viewerId, solo).every((c) => c.ok) && (p.authorId !== viewerId || solo));
          return (
            <section className="so-card so-card-pad" style={{ display: "grid", gap: 8 }} data-testid="batch-approve">
              <span style={{ fontWeight: 600 }}>Batch approve</span>
              <span style={{ fontSize: 12, color: "var(--text3)" }}>Approves every post in this list that passes all checks and is not yours. Approving never publishes; scheduling stays separate.</span>
              <button className="so-btn" data-variant="primary" style={{ height: 34 }} disabled={busy || ready.length === 0} onClick={() => void batchApprove(ready)}>
                {ready.length ? `Approve ${ready.length} that pass` : "Nothing passes all checks"}
              </button>
            </section>
          );
        })() : null}
        <section className="so-card" style={{ overflow: "hidden" }}>
          <div className="so-card-pad" style={{ borderBottom: "1px solid var(--line)" }}><span className="so-stat-label">Up next</span></div>
          {order.slice(order.indexOf(current) + 1, order.indexOf(current) + 6).map((p) => (
            <div key={p.id} style={{ padding: "9px 16px", borderBottom: "1px solid var(--line)", fontSize: 12.5 }}>
              <div style={{ fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.title ?? p.content.slice(0, 60)}</div>
              <div className="so-mono" style={{ fontSize: 11, color: "var(--text3)" }}>{PLATFORM_CONFIGS[p.platform]?.name ?? p.platform} · {p.changed}{done[p.id] === "skipped" ? " · skipped" : ""}</div>
            </div>
          ))}
          {order.length <= order.indexOf(current) + 1 ? <div className="so-empty">Nothing else waiting.</div> : null}
        </section>
      </div>
    </div>
  );
}
