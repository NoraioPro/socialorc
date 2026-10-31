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
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 300px", gap: 12, alignItems: "start" }}>
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

        <div style={{ display: "grid", gridTemplateColumns: "56px repeat(7, minmax(0,1fr))" }}>
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

      <aside className="so-card so-card-pad" style={{ display: "grid", gap: 10, position: "sticky", top: 12 }}>
        <div className="so-row" style={{ justifyContent: "space-between" }}>
          <span className="so-stat-label">Approved · ready to schedule</span>
          <span className="so-mono" style={{ fontSize: 11, color: "var(--text3)" }}>{approved.length}</span>
        </div>
        {approved.length === 0 ? (
          <div className="so-empty" style={{ padding: "18px 6px" }}>
            No approved posts waiting to be scheduled.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            {approved.map((a) => (
              <div
                key={a.id}
                draggable
                onDragStart={(e) => { e.dataTransfer.setData("text/plain", a.id); setPicked(a.id); }}
                onClick={() => setPicked(picked === a.id ? null : a.id)}
                style={{
                  display: "grid", gap: 3, padding: "8px 10px", borderRadius: 8, cursor: "grab",
                  border: `1px solid ${picked === a.id ? "var(--accent)" : "var(--line2)"}`,
                  background: picked === a.id ? "var(--accentSoft)" : "var(--panel2)",
                }}
              >
                <span className="so-mono" style={{ fontSize: 10.5, color: "var(--text3)" }}>
                  {PLATFORM_CONFIGS[a.platform]?.name ?? a.platform}
                </span>
                <span style={{ fontSize: 12.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {a.title ?? "Untitled post"}
                </span>
              </div>
            ))}
          </div>
        )}
        <p style={{ margin: 0, fontSize: 11.5, color: "var(--text3)" }}>
          {picked ? "Now tap a slot on the grid (or drop it there)." : "Drag a post onto the week, or tap it then tap a slot."}
        </p>
        {note ? (
          <span style={{ fontSize: 11.5, color: note.kind === "ok" ? "var(--green)" : "var(--red)" }}>{note.text}</span>
        ) : null}
        {busy ? <span className="so-mono" style={{ fontSize: 11, color: "var(--text3)" }}>Scheduling…</span> : null}
      </aside>
    </div>
  );
}
