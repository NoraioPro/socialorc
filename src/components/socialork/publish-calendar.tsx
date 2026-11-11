"use client";

/**
 * Publishing, in the handoff's shape: the week with its hours, the approved
 * tray, and drag-onto-the-grid (or tap the post, then tap a slot). Dropping
 * calls the real schedule endpoint, so the server still owns every rule.
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PLATFORM_CONFIGS } from "@/types/platform";

type Item = { id: string; title: string | null; platform: keyof typeof PLATFORM_CONFIGS; when: string };

const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function startOfWeek(d: Date): Date {
  const copy = new Date(d);
  const day = (copy.getDay() + 6) % 7; // Monday = 0
  copy.setDate(copy.getDate() - day);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function PublishCalendar({ scheduled, approved }: { scheduled: Item[]; approved: Item[] }) {
  const router = useRouter();
  const [weekOffset, setWeekOffset] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const weekStart = useMemo(() => {
    const s = startOfWeek(new Date());
    s.setDate(s.getDate() + weekOffset * 7);
    return s;
  }, [weekOffset]);

  const days = useMemo(
    () =>
      DAYS.map((name, i) => {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + i);
        return { name, date: d, num: d.getDate() };
      }),
    [weekStart],
  );

  const cellFor = (iso: string) => {
    const d = new Date(iso);
    const dayIndex = (d.getDay() + 6) % 7;
    const inWeek = startOfWeek(d).getTime() === weekStart.getTime();
    return inWeek ? { dayIndex, hour: d.getHours() } : null;
  };

  const schedule = async (postId: string, dayIndex: number, hour: number) => {
    const when = new Date(days[dayIndex].date);
    when.setHours(hour, 0, 0, 0);
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch(`/api/posts/${postId}/schedule`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scheduledFor: when.toISOString() }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setNote({ kind: "err", text: data.error ?? `Could not schedule (${res.status}).` });
        return;
      }
      setPicked(null);
      setNote({ kind: "ok", text: "Scheduled. The approval is kept." });
      router.refresh();
    } catch {
      setNote({ kind: "err", text: "Network error — nothing was scheduled." });
    } finally {
      setBusy(false);
    }
  };

  const weekLabel = `${days[0].date.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${days[6].date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="so-card" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "10px 14px" }}>
        <span style={{ fontSize: 12, color: "var(--text2)", whiteSpace: "nowrap" }}>Approved · ready to schedule <span className="so-mono" style={{ color: "var(--text3)" }}>{approved.length}</span></span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, flex: 1, minWidth: 0 }}>
          {approved.length === 0 ? (
            <span style={{ fontSize: 12, color: "var(--text3)" }}>No approved posts waiting to be scheduled.</span>
          ) : approved.map((a) => (
            <button
              key={a.id}
              type="button"
              draggable
              aria-pressed={picked === a.id}
              onDragStart={(e) => { e.dataTransfer.setData("text/plain", a.id); setPicked(a.id); }}
              onClick={() => setPicked(picked === a.id ? null : a.id)}
              style={{
                height: 30, display: "flex", alignItems: "center", gap: 8, padding: "0 10px", borderRadius: 7, cursor: "grab", maxWidth: 280, color: "var(--text)",
                border: `1px solid ${picked === a.id ? "var(--accent)" : "var(--line2)"}`,
                background: picked === a.id ? "var(--accentSoft)" : "var(--panel2)",
              }}
            >
              <span className="so-mono" style={{ fontSize: 10.5, color: "var(--text3)" }}>{PLATFORM_CONFIGS[a.platform]?.name ?? a.platform}</span>
              <span style={{ fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.title ?? "Untitled post"}</span>
            </button>
          ))}
        </div>
        {busy ? <span className="so-mono" style={{ fontSize: 11, color: "var(--text3)" }}>Scheduling…</span> : null}
      </div>

      <section className="so-card">
        <div className="so-card-pad so-row" style={{ justifyContent: "space-between", borderBottom: "1px solid var(--line)" }}>
          <div className="so-row" style={{ gap: 8 }}>
            <button className="so-btn" style={{ height: 26, padding: "0 9px" }} onClick={() => setWeekOffset((w) => w - 1)}>‹</button>
            <button className="so-btn" style={{ height: 26, padding: "0 9px" }} onClick={() => setWeekOffset(0)}>This week</button>
            <button className="so-btn" style={{ height: 26, padding: "0 9px" }} onClick={() => setWeekOffset((w) => w + 1)}>›</button>
          </div>
          <span className="so-mono" style={{ fontSize: 11, color: "var(--text3)" }}>
            {weekLabel} · {Intl.DateTimeFormat().resolvedOptions().timeZone}
          </span>
        </div>

        <div className="so-cal-grid" style={{ display: "grid", gridTemplateColumns: "56px repeat(7, minmax(0,1fr))" }}>
          <div />
          {days.map((d) => (
            <div key={d.name} className="so-mono" style={{ padding: "8px 6px", textAlign: "center", fontSize: 10.5, color: "var(--text3)", borderBottom: "1px solid var(--line)" }}>
              {d.name} <b style={{ color: "var(--text2)" }}>{d.num}</b>
            </div>
          ))}

          {HOURS.map((hour) => (
            <div key={hour} style={{ display: "contents" }}>
              <div className="so-mono" style={{ padding: "8px 6px", fontSize: 10, color: "var(--text3)", textAlign: "right", borderBottom: "1px solid var(--line)" }}>
                {String(hour).padStart(2, "0")}:00
              </div>
              {days.map((d, dayIndex) => {
                const items = scheduled.filter((s) => {
                  const c = cellFor(s.when);
                  return c && c.dayIndex === dayIndex && c.hour === hour;
                });
                const droppable = Boolean(picked);
                return (
                  <div
                    key={`${hour}-${d.name}`}
                    onDragOver={(e) => { if (droppable) e.preventDefault(); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const id = e.dataTransfer.getData("text/plain") || picked;
                      if (id) void schedule(id, dayIndex, hour);
                    }}
                    onClick={() => { if (picked) void schedule(picked, dayIndex, hour); }}
                    style={{
                      minHeight: 44, padding: 3, borderBottom: "1px solid var(--line)",
                      borderLeft: "1px solid var(--line)", display: "grid", gap: 3, alignContent: "start",
                      cursor: droppable ? "copy" : "default",
                      background: droppable ? "var(--accentSoft)" : "transparent",
                    }}
                  >
                    {items.map((it) => (
                      <div key={it.id} className="so-pill" data-tone="scheduled"
                        style={{ display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontSize: 10.5, maxWidth: "100%" }}>
                        {PLATFORM_CONFIGS[it.platform]?.name ?? it.platform} · {(it.title ?? "Untitled").slice(0, 18)}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </section>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12, color: "var(--text3)" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: "var(--blue)" }} />Scheduled</span>
        <span style={{ flex: 1 }} />
        <span>{picked ? "Now tap a slot on the grid (or drop it there)." : "Drag a post onto the week, or tap it then tap a slot."}</span>
        {note ? <span style={{ color: note.kind === "ok" ? "var(--green)" : "var(--red)" }} role="status">{note.text}</span> : null}
      </div>
    </div>
  );
}
