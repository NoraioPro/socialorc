"use client";

/**
 * The Timeline screen (design: "SocialOrk Timeline"). Team posts and team
 * updates grouped by day, with reactions, comments, a details drawer and a
 * right-hand summary. Every write goes through the feed routes, which check the
 * workspace on the server; this screen only shows what they return.
 *
 * The English / Arabic switch changes this screen's own words and layout
 * direction. People's posts and comments are shown as written.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Portal } from "@/components/socialork/portal";
import type { Platform, PostStatus } from "@prisma/client";
import { GLYPHS, type GlyphName } from "@/components/socialork/platform-glyphs";
import type {
  TimelineData, TimelineItem, TimelinePost, TimelineReaction, TimelineComment, UpdateVisibility,
} from "@/lib/socialork/timeline";

type Lang = "en" | "ar";
const RT = ["LIKE", "CELEBRATE", "INSIGHTFUL", "SUPPORT"] as const;
type RType = (typeof RT)[number];

const ICON: Record<RType, string> = {
  LIKE: "M7 10v12M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z",
  CELEBRATE: "M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2zM19 3v4M21 5h-4",
  INSIGHTFUL: "M9 18h6M10 22h4M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14",
  SUPPORT: "M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z",
};

const PLATFORM: Record<Platform, { name: string; glyph: GlyphName }> = {
  LINKEDIN: { name: "LinkedIn", glyph: "linkedin" },
  TWITTER: { name: "X", glyph: "x" },
  INSTAGRAM: { name: "Instagram", glyph: "instagram" },
  FACEBOOK: { name: "Facebook", glyph: "facebook" },
  YOUTUBE: { name: "YouTube", glyph: "youtube" },
  TIKTOK: { name: "TikTok", glyph: "tiktok" },
  TELEGRAM: { name: "Telegram", glyph: "telegram" },
} as Record<Platform, { name: string; glyph: GlyphName }>;
const platformOf = (p: Platform) => PLATFORM[p] ?? { name: String(p), glyph: "linkedin" as GlyphName };

type StatusKey = "published" | "scheduled" | "approved" | "review" | "update";
const STATUS_OF: Partial<Record<PostStatus, StatusKey>> = {
  PUBLISHED: "published", SCHEDULED: "scheduled", APPROVED: "approved", PENDING_APPROVAL: "review",
};
const TONE: Record<StatusKey, [string, string]> = {
  published: ["var(--greenSoft)", "var(--green)"],
  scheduled: ["var(--blueSoft)", "var(--blue)"],
  approved: ["var(--accentSoft)", "var(--accent)"],
  review: ["var(--amberSoft)", "var(--amber)"],
  update: ["var(--panel2)", "var(--text2)"],
};
const TINTS = ["#48ED85", "#7CB7FF", "#F5C451", "#FF8A7A", "#C9A7FF", "#5FD4D0"];
const tintOf = (id: string) => TINTS[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % TINTS.length];

const T = {
  en: {
    title: "Timeline",
    sub: "Everything this workspace has in review, approved, scheduled or published, plus updates from the team. Newest first, for the active brain.",
    f: { all: "All", updates: "Team updates", published: "Published", scheduled: "Scheduled", approved: "Approved", review: "In review" },
    chAll: "All channels",
    composerPh: "Share an update with the team…",
    vis: { PUBLIC: "Workspace", PRIVATE: "Only me" } as Record<UpdateVisibility, string>,
    visLong: { PUBLIC: "Everyone in the workspace", PRIVATE: "Only you" } as Record<UpdateVisibility, string>,
    composerNote: "Team updates stay inside SocialOrk. They are never published to a channel.",
    post: "Post update", posting: "Posting…",
    days: { upcoming: "Coming up", today: "Today", yesterday: "Yesterday", week: "Earlier this week", earlier: "Earlier" },
    st: { published: "Published", scheduled: "Scheduled", approved: "Approved", review: "In review", update: "Team update" } as Record<StatusKey, string>,
    view: (ch: string) => `View on ${ch} ↗`,
    seeMore: "See more", seeLess: "See less",
    r: { LIKE: "Like", CELEBRATE: "Celebrate", INSIGHTFUL: "Insightful", SUPPORT: "Support" } as Record<RType, string>,
    reactions: (n: number) => (n === 1 ? "1 reaction" : `${n} reactions`),
    comments: (n: number) => (n === 1 ? "1 comment" : `${n} comments`),
    showAll: (n: number) => `Show all ${n} comments`, fewer: "Show fewer",
    commentPh: "Add a comment…", send: "Send", del: "Delete", delUpdate: "Delete update", confirmDel: "Delete this update?", cancel: "Cancel",
    whoTitle: "Reactions", andMore: (n: number) => `and ${n} more`, close: "Close", you: "You",
    week: "This week", stPub: "Published", stReact: "Reactions", stCom: "Comments",
    next: "Up next", openCal: "Open calendar", nothingNext: "Nothing scheduled yet.", needsSlot: "Approved · needs a time",
    top: "Most reacted",
    emptyTitle: "Nothing on the timeline yet",
    emptyBody: "Posts appear here once they go to review. Share a team update to get things started.",
    noMatch: "Nothing matches these filters.", clear: "Clear filters",
    toastErr: "Network error — the reaction was not saved.", toastPosted: "Update posted to the timeline.",
    toastComment: "Comment added.", toastDeleted: "Deleted.", toastFail: "That did not save. Try again.",
    details: "Post details", dChannel: "Channel", dStatus: "Status", dAuthor: "Author", dAccount: "Account", dTrail: "Approval trail",
    openDraft: "Open in Drafts",
    trail: {
      created: (a: string) => `Written by ${a}`, appr: (a: string) => `Approved by ${a}`,
      pub: (c: string) => `Published to ${c}`, sched: "Scheduled", slot: "Waiting for a time in the calendar", wait: "Waiting for approval",
    },
    readOnly: "Your role can read the timeline but not post, react or comment.",
    lang: "Language",
  },
  ar: {
    title: "الخط الزمني",
    sub: "كل ما لدى مساحة العمل قيد المراجعة أو موافق عليه أو مجدول أو منشور، مع تحديثات الفريق. الأحدث أولاً، للعقل النشط.",
    f: { all: "الكل", updates: "تحديثات الفريق", published: "منشور", scheduled: "مجدول", approved: "موافق عليه", review: "قيد المراجعة" },
    chAll: "كل القنوات",
    composerPh: "شارك تحديثاً مع الفريق…",
    vis: { PUBLIC: "مساحة العمل", PRIVATE: "أنا فقط" } as Record<UpdateVisibility, string>,
    visLong: { PUBLIC: "كل من في مساحة العمل", PRIVATE: "أنت فقط" } as Record<UpdateVisibility, string>,
    composerNote: "تحديثات الفريق تبقى داخل SocialOrk ولا تُنشر على أي قناة.",
    post: "نشر التحديث", posting: "جارٍ النشر…",
    days: { upcoming: "قادم", today: "اليوم", yesterday: "أمس", week: "في وقت سابق من هذا الأسبوع", earlier: "أقدم" },
    st: { published: "منشور", scheduled: "مجدول", approved: "موافق عليه", review: "قيد المراجعة", update: "تحديث للفريق" } as Record<StatusKey, string>,
    view: (ch: string) => `عرض على ${ch} ↗`,
    seeMore: "عرض المزيد", seeLess: "عرض أقل",
    r: { LIKE: "أعجبني", CELEBRATE: "احتفاء", INSIGHTFUL: "مفيد", SUPPORT: "دعم" } as Record<RType, string>,
    reactions: (n: number) => `${n} تفاعل`,
    comments: (n: number) => `${n} تعليق`,
    showAll: (n: number) => `عرض كل التعليقات (${n})`, fewer: "عرض أقل",
    commentPh: "أضف تعليقاً…", send: "إرسال", del: "حذف", delUpdate: "حذف التحديث", confirmDel: "حذف هذا التحديث؟", cancel: "إلغاء",
    whoTitle: "التفاعلات", andMore: (n: number) => `و${n} آخرين`, close: "إغلاق", you: "أنت",
    week: "هذا الأسبوع", stPub: "منشورات", stReact: "تفاعلات", stCom: "تعليقات",
    next: "التالي", openCal: "فتح التقويم", nothingNext: "لا شيء مجدول بعد.", needsSlot: "موافق عليه · يحتاج موعداً",
    top: "الأكثر تفاعلاً",
    emptyTitle: "لا شيء في الخط الزمني بعد",
    emptyBody: "تظهر المنشورات هنا بمجرد إرسالها للمراجعة. شارك تحديثاً للفريق لتبدأ.",
    noMatch: "لا شيء يطابق هذه الفلاتر.", clear: "مسح الفلاتر",
    toastErr: "خطأ في الشبكة — لم يُحفظ التفاعل.", toastPosted: "تم نشر التحديث في الخط الزمني.",
    toastComment: "تمت إضافة التعليق.", toastDeleted: "تم الحذف.", toastFail: "لم يتم الحفظ. حاول مرة أخرى.",
    details: "تفاصيل المنشور", dChannel: "القناة", dStatus: "الحالة", dAuthor: "الكاتب", dAccount: "الحساب", dTrail: "مسار الموافقة",
    openDraft: "فتح في المسودات",
    trail: {
      created: (a: string) => `كتبه ${a}`, appr: (a: string) => `وافق عليه ${a}`,
      pub: (c: string) => `نُشر على ${c}`, sched: "مجدول", slot: "بانتظار موعد في التقويم", wait: "بانتظار الموافقة",
    },
    readOnly: "دورك يتيح قراءة الخط الزمني فقط، دون النشر أو التفاعل أو التعليق.",
    lang: "اللغة",
  },
};

type FilterKey = "all" | "updates" | "published" | "scheduled" | "approved" | "review";
type GroupKey = "upcoming" | "today" | "yesterday" | "week" | "earlier";
const LANG_KEY = "so-timeline-lang";

function Glyph({ name, size = 12 }: { name: GlyphName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ display: "block", flex: "none" }}>
      <path d={GLYPHS[name]} />
    </svg>
  );
}
function RIcon({ type, color = "currentColor" }: { type: RType; color?: string }) {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: "block", flex: "none" }}>
      <path d={ICON[type]} />
    </svg>
  );
}

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function groupOf(at: string, now: Date): GroupKey {
  const d = new Date(at), today = startOfDay(now);
  const day = startOfDay(d).getTime();
  if (day > today.getTime()) return "upcoming";
  if (day === today.getTime()) return "today";
  if (day === today.getTime() - 864e5) return "yesterday";
  if (day > today.getTime() - 7 * 864e5) return "week";
  return "earlier";
}

export function TimelineView({ data, canPost }: { data: TimelineData; canPost: boolean }) {
  const [lang, setLang] = useState<Lang>("en");
  const [items, setItems] = useState<TimelineItem[]>(data.items);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [chans, setChans] = useState<Platform[]>([]);
  const [draft, setDraft] = useState("");
  const [vis, setVis] = useState<UpdateVisibility>("PUBLIC");
  const [posting, setPosting] = useState(false);
  const [more, setMore] = useState<Record<string, boolean>>({});
  const [allC, setAllC] = useState<Record<string, boolean>>({});
  const [cd, setCd] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [who, setWho] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; err: boolean } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [now] = useState(() => new Date());
  const t = T[lang];
  const me = data.viewerId;

  useEffect(() => {
    try {
      const v = window.localStorage.getItem(LANG_KEY);
      if (v === "ar" || v === "en") setLang(v);
    } catch { /* storage may be blocked */ }
  }, []);
  const pickLang = (l: Lang) => {
    setLang(l);
    try { window.localStorage.setItem(LANG_KEY, l); } catch { /* ignore */ }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setDrawer(null); setWho(null); } };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); clearTimeout(toastTimer.current); };
  }, []);

  const flash = useCallback((text: string, err = false) => {
    clearTimeout(toastTimer.current);
    setToast({ text, err });
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }, []);

  const locale = lang === "ar" ? "ar-u-nu-latn" : "en-GB";
  const fmt = useMemo(() => ({
    time: new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }),
    day: new Intl.DateTimeFormat(locale, { weekday: "short", hour: "2-digit", minute: "2-digit" }),
    date: new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
  }), [locale]);
  const when = (at: string | null) => {
    if (!at) return "—";
    const g = groupOf(at, now), d = new Date(at);
    return g === "today" || g === "yesterday" ? fmt.time.format(d) : g === "week" ? fmt.day.format(d) : fmt.date.format(d);
  };
  const person = (id: string) => (id === me ? { ...(data.people[id] ?? { id, name: t.you, initials: "?", headline: null }) } : data.people[id] ?? { id, name: "A teammate", initials: "?", headline: null });
  const nameOf = (id: string) => (id === me ? t.you : person(id).name);

  const statusOf = (it: TimelineItem): StatusKey => (it.kind === "update" ? "update" : STATUS_OF[it.status] ?? "review");
  const matches = (it: TimelineItem, f: FilterKey) =>
    f === "all" ? true : f === "updates" ? it.kind === "update" : it.kind === "post" && statusOf(it) === f;
  const chMatch = (it: TimelineItem) => !chans.length || (it.kind === "post" && chans.includes(it.platform));
  const visible = items.filter((it) => matches(it, filter) && (filter === "updates" || chMatch(it)));
  const usedPlatforms = [...new Set(items.filter((i): i is TimelinePost => i.kind === "post").map((i) => i.platform))];

  const ORDER: GroupKey[] = ["upcoming", "today", "yesterday", "week", "earlier"];
  const groups = ORDER.map((g) => ({ key: g, items: visible.filter((it) => groupOf(it.at, now) === g) })).filter((g) => g.items.length);

  /* ---------- writes ---------- */
  const react = async (it: TimelineItem, type: RType) => {
    if (!canPost) return;
    const before = it.reactions;
    const mine = before.find((r) => r.userId === me);
    const next: TimelineReaction[] = before.filter((r) => r.userId !== me);
    if (mine?.type !== type) next.push({ userId: me, type });
    setItems((xs) => xs.map((x) => (x.id === it.id ? { ...x, reactions: next } : x)));
    try {
      const res = await fetch(it.kind === "post" ? "/api/feed/reactions" : "/api/feed/updates/reactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(it.kind === "post" ? { postId: it.id, type } : { updateId: it.id, type }),
      });
      if (!res.ok) throw new Error();
      const body = (await res.json()) as { reactions: TimelineReaction[] };
      setItems((xs) => xs.map((x) => (x.id === it.id ? { ...x, reactions: body.reactions } : x)));
    } catch {
      setItems((xs) => xs.map((x) => (x.id === it.id ? { ...x, reactions: before } : x)));
      flash(t.toastErr, true);
    }
  };

  const comment = async (it: TimelineItem) => {
    const text = (cd[it.id] ?? "").trim();
    if (!text || !canPost) return;
    setBusy(`c:${it.id}`);
    try {
      const res = await fetch(it.kind === "post" ? "/api/feed/comments" : "/api/feed/updates/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(it.kind === "post" ? { postId: it.id, content: text } : { updateId: it.id, content: text }),
      });
      if (!res.ok) throw new Error();
      const { comment: c } = (await res.json()) as { comment: { id: string; userId: string; content: string; createdAt: string } };
      const added: TimelineComment = { id: c.id, userId: c.userId, body: c.content, at: c.createdAt };
      setItems((xs) => xs.map((x) => (x.id === it.id ? { ...x, comments: [...x.comments, added] } : x)));
      setCd((m) => ({ ...m, [it.id]: "" }));
      flash(t.toastComment);
    } catch {
      flash(t.toastFail, true);
    } finally {
      setBusy(null);
    }
  };

  const deleteComment = async (it: TimelineItem, id: string) => {
    const base = it.kind === "post" ? "/api/feed/comments" : "/api/feed/updates/comments";
    const res = await fetch(`${base}?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) { flash(t.toastFail, true); return; }
    setItems((xs) => xs.map((x) => (x.id === it.id ? { ...x, comments: x.comments.filter((c) => c.id !== id) } : x)));
    flash(t.toastDeleted);
  };

  const postUpdate = async () => {
    const body = draft.trim();
    if (!body || body.length > 1000 || !canPost) return;
    setPosting(true);
    try {
      const res = await fetch("/api/feed/updates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, visibility: vis }),
      });
      if (!res.ok) throw new Error();
      const { update } = (await res.json()) as { update: { id: string; authorId: string; body: string; visibility: string; createdAt: string } };
      setItems((xs) => [{
        kind: "update", id: update.id, authorId: update.authorId, at: update.createdAt, body: update.body,
        visibility: update.visibility === "PRIVATE" ? "PRIVATE" : "PUBLIC", reactions: [], comments: [],
      }, ...xs]);
      setDraft("");
      if (filter !== "all" && filter !== "updates") setFilter("all");
      flash(t.toastPosted);
    } catch {
      flash(t.toastFail, true);
    } finally {
      setPosting(false);
    }
  };

  const deleteUpdate = async (id: string) => {
    const res = await fetch(`/api/feed/updates?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
    setConfirmDel(null);
    if (!res?.ok) { flash(t.toastFail, true); return; }
    setItems((xs) => xs.filter((x) => x.id !== id));
    flash(t.toastDeleted);
  };

  /* ---------- summary ---------- */
  const weekAgo = now.getTime() - 7 * 864e5;
  const recent = items.filter((i) => new Date(i.at).getTime() >= weekAgo);
  const stats = [
    { value: data.week.published, label: t.stPub },
    { value: recent.reduce((a, i) => a + i.reactions.length, 0), label: t.stReact },
    { value: recent.reduce((a, i) => a + i.comments.length, 0), label: t.stCom },
  ];
  const posts = items.filter((i): i is TimelinePost => i.kind === "post");
  const top = posts.slice().sort((a, b) => b.reactions.length - a.reactions.length)[0];
  const drawerPost = posts.find((p) => p.id === drawer) ?? null;

  /* ---------- pieces ---------- */
  const pill = (k: StatusKey, extra?: string) => (
    <span style={{ height: 22, display: "inline-flex", alignItems: "center", padding: "0 8px", borderRadius: 6, background: TONE[k][0], color: TONE[k][1], fontSize: 11.5, fontWeight: 600, whiteSpace: "nowrap" }}>
      {t.st[k]}{extra ? ` · ${extra}` : ""}
    </span>
  );
  const avatar = (id: string, size = 34) => (
    <span aria-hidden="true" style={{ width: size, height: size, flex: "none", borderRadius: "50%", background: tintOf(id), display: "grid", placeItems: "center", fontSize: size > 30 ? 12 : 10, fontWeight: 700, color: "#06140B" }}>
      {person(id).initials}
    </span>
  );
  const seg = (on: boolean): React.CSSProperties => ({
    height: 28, display: "flex", alignItems: "center", gap: 6, padding: "0 12px", border: 0, borderRadius: 6, fontSize: 12.5, fontWeight: 500,
    whiteSpace: "nowrap", background: on ? "var(--panel2)" : "transparent", color: on ? "var(--text)" : "var(--text2)", cursor: "pointer",
  });
  const card: React.CSSProperties = { border: "1px solid var(--line)", borderRadius: 12, background: "var(--panel)" };

  const renderItem = (it: TimelineItem) => {
    const st = statusOf(it);
    const author = person(it.authorId);
    const isPost = it.kind === "post";
    const long = it.body.length > 280, open = !!more[it.id];
    const body = long && !open ? it.body.slice(0, 280).replace(/\s+\S*$/, "") + "…" : it.body;
    const mine = it.reactions.find((r) => r.userId === me)?.type as RType | undefined;
    const counts = Object.fromEntries(RT.map((r) => [r, it.reactions.filter((x) => x.type === r).length])) as Record<RType, number>;
    const showAll = !!allC[it.id];
    const shown = showAll ? it.comments : it.comments.slice(-3);
    const meta = [author.headline, when(it.at), !isPost ? t.visLong[it.visibility] : null].filter(Boolean).join(" · ");
    return (
      <article key={it.id} style={{ ...card, position: "relative", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12, animation: "so-page .4s cubic-bezier(.2,.7,.2,1) backwards" }}>
        <span aria-hidden="true" style={{ position: "absolute", insetInlineStart: -28, top: 22, width: 9, height: 9, borderRadius: "50%", background: st === "update" ? "var(--text3)" : TONE[st][1], boxShadow: "0 0 0 3px var(--bg)" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {avatar(it.authorId)}
          <span style={{ flex: "1 1 160px", minWidth: 0 }}>
            <span style={{ display: "block", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{nameOf(it.authorId)}</span>
            <span style={{ display: "block", fontSize: 12, color: "var(--text3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{meta}</span>
          </span>
          {isPost ? (
            <span title={platformOf(it.platform).name} style={{ width: 26, height: 26, flex: "none", borderRadius: 7, border: "1px solid var(--line2)", display: "grid", placeItems: "center", color: "var(--text2)" }}>
              <Glyph name={platformOf(it.platform).glyph} size={13} />
            </span>
          ) : null}
          {pill(st, isPost && it.status === "SCHEDULED" ? when(it.scheduledFor) : undefined)}
          {!isPost && it.authorId === me ? (
            confirmDel === it.id ? (
              <span style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
                {t.confirmDel}
                <button className="so-btn" style={{ height: 26 }} onClick={() => void deleteUpdate(it.id)}>{t.del}</button>
                <button className="so-btn" data-variant="ghost" style={{ height: 26 }} onClick={() => setConfirmDel(null)}>{t.cancel}</button>
              </span>
            ) : (
              <button className="so-btn" data-variant="ghost" style={{ height: 26, fontSize: 12 }} onClick={() => setConfirmDel(it.id)} aria-label={t.delUpdate}>{t.del}</button>
            )
          ) : null}
        </div>

        {isPost && it.title ? (
          <button onClick={() => setDrawer(it.id)} style={{ alignSelf: "flex-start", padding: 0, border: 0, background: "none", textAlign: "start", fontSize: 15.5, fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1.35, color: "var(--text)", cursor: "pointer" }}>
            {it.title}
          </button>
        ) : null}
        <div dir="auto" style={{ fontSize: 13.5, lineHeight: 1.6, whiteSpace: "pre-line", overflowWrap: "anywhere" }}>
          {body}
          {long ? (
            <>
              {" "}
              <button onClick={() => setMore((m) => ({ ...m, [it.id]: !open }))} style={{ padding: 0, border: 0, background: "none", color: "var(--text2)", fontWeight: 600, cursor: "pointer" }}>
                {open ? t.seeLess : t.seeMore}
              </button>
            </>
          ) : null}
        </div>
        {isPost && !it.title ? (
          <button onClick={() => setDrawer(it.id)} style={{ alignSelf: "flex-start", padding: 0, border: 0, background: "none", color: "var(--text2)", fontSize: 12, cursor: "pointer" }}>{t.details}</button>
        ) : null}

        {isPost && it.media ? (
          <div style={{ position: "relative", borderRadius: 10, overflow: "hidden", background: "var(--bg)", maxHeight: 320 }}>
            {it.media.video ? (
              <video src={it.media.url} controls preload="metadata" style={{ display: "block", width: "100%", maxHeight: 320, objectFit: "cover" }} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={it.media.url} alt="" style={{ display: "block", width: "100%", maxHeight: 320, objectFit: "cover" }} />
            )}
            {it.media.count > 1 ? (
              <span className="so-mono" style={{ position: "absolute", top: 10, insetInlineEnd: 10, height: 22, padding: "0 8px", borderRadius: 6, background: "rgba(11,11,14,.72)", display: "flex", alignItems: "center", fontSize: 11, color: "#EDEDF1" }}>
                1/{it.media.count}
              </span>
            ) : null}
          </div>
        ) : null}

        {isPost && it.status === "PUBLISHED" && it.url ? (
          <a href={it.url} target="_blank" rel="noreferrer" style={{ alignSelf: "flex-start", fontSize: 12.5, fontWeight: 600 }}>{t.view(platformOf(it.platform).name)}</a>
        ) : null}

        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {RT.map((r) => {
            const on = mine === r;
            return (
              <button key={r} onClick={() => void react(it, r)} disabled={!canPost} aria-pressed={on} title={t.r[r]}
                style={{ height: 28, display: "flex", alignItems: "center", gap: 6, padding: "0 10px", border: `1px solid ${on ? "var(--accent)" : "var(--line)"}`, borderRadius: 999, background: on ? "var(--accentSoft)" : "transparent", color: on ? "var(--text)" : "var(--text2)", fontSize: 12, fontWeight: 500, cursor: canPost ? "pointer" : "default" }}>
                <RIcon type={r} />{t.r[r]}{counts[r] ? <span className="so-mono" style={{ fontSize: 11 }}>{counts[r]}</span> : null}
              </button>
            );
          })}
          <span style={{ flex: 1 }} />
          <span style={{ position: "relative" }}>
            <button onClick={() => setWho((w) => (w === it.id ? null : it.id))} disabled={!it.reactions.length} style={{ padding: 0, border: 0, background: "none", fontSize: 12, color: "var(--text3)", cursor: it.reactions.length ? "pointer" : "default" }}>
              {t.reactions(it.reactions.length)}
            </button>
            {who === it.id ? (
              <div role="dialog" aria-label={t.whoTitle} style={{ position: "absolute", bottom: 26, insetInlineEnd: 0, zIndex: 5, width: 250, padding: 10, border: "1px solid var(--line2)", borderRadius: 10, background: "var(--panel2)", boxShadow: "0 20px 50px rgba(0,0,0,.5)", display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: 600, fontSize: 12.5 }}>{t.whoTitle}</span>
                  <button onClick={() => setWho(null)} aria-label={t.close} style={{ width: 22, height: 22, border: 0, borderRadius: 6, background: "none", color: "var(--text3)", cursor: "pointer" }}>✕</button>
                </div>
                {it.reactions.slice(0, 10).map((r) => (
                  <div key={r.userId} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                    <RIcon type={(RT as readonly string[]).includes(r.type) ? (r.type as RType) : "LIKE"} color="var(--accent)" />
                    <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{nameOf(r.userId)}</span>
                    <span style={{ fontSize: 11.5, color: "var(--text3)" }}>{t.r[r.type as RType] ?? r.type}</span>
                  </div>
                ))}
                {it.reactions.length > 10 ? <div style={{ fontSize: 12, color: "var(--text3)" }}>{t.andMore(it.reactions.length - 10)}</div> : null}
              </div>
            ) : null}
          </span>
          <span style={{ fontSize: 12, color: "var(--text3)" }}>· {t.comments(it.comments.length)}</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
          {it.comments.length > 3 ? (
            <button onClick={() => setAllC((m) => ({ ...m, [it.id]: !showAll }))} style={{ alignSelf: "flex-start", padding: 0, border: 0, background: "none", fontSize: 12, fontWeight: 600, color: "var(--text2)", cursor: "pointer" }}>
              {showAll ? t.fewer : t.showAll(it.comments.length)}
            </button>
          ) : null}
          {shown.map((c) => (
            <div key={c.id} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              {avatar(c.userId, 26)}
              <div style={{ flex: 1, minWidth: 0, padding: "8px 12px", borderRadius: 10, background: "var(--bg)" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 12.5 }}>{nameOf(c.userId)}</span>
                  <span className="so-mono" style={{ fontSize: 11, color: "var(--text3)" }}>{when(c.at)}</span>
                  {c.userId === me ? (
                    <button onClick={() => void deleteComment(it, c.id)} style={{ marginInlineStart: "auto", padding: 0, border: 0, background: "none", fontSize: 11.5, color: "var(--text3)", cursor: "pointer" }}>{t.del}</button>
                  ) : null}
                </div>
                <div dir="auto" style={{ fontSize: 13, lineHeight: 1.55, overflowWrap: "anywhere", whiteSpace: "pre-line" }}>{c.body}</div>
              </div>
            </div>
          ))}
          {canPost ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                value={cd[it.id] ?? ""}
                onChange={(e) => { const v = e.target.value; setCd((m) => ({ ...m, [it.id]: v })); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void comment(it); } }}
                placeholder={t.commentPh}
                aria-label={t.commentPh}
                maxLength={1000}
                dir="auto"
                style={{ flex: 1, minWidth: 0, height: 32, padding: "0 12px", border: "1px solid var(--line2)", borderRadius: 8, background: "var(--bg)", color: "var(--text)", fontSize: 12.5, outline: "none" }}
              />
              <button className="so-btn" style={{ height: 32 }} onClick={() => void comment(it)} disabled={busy === `c:${it.id}` || !(cd[it.id] ?? "").trim()}>{t.send}</button>
            </div>
          ) : null}
        </div>
      </article>
    );
  };

  return (
    <div dir={lang === "ar" ? "rtl" : "ltr"} lang={lang} className="so-page" style={{ fontFamily: lang === "ar" ? "var(--font-plex-arabic), var(--font-hanken), system-ui, sans-serif" : undefined }}>
      <div className="so-spread">
        <div style={{ display: "grid", gap: 6, flex: "1 1 420px", minWidth: 0 }}>
          <h1 className="so-h1">{t.title}</h1>
          <p className="so-sub">{t.sub}</p>
        </div>
        <div role="group" aria-label={t.lang} style={{ display: "flex", padding: 2, border: "1px solid var(--line)", borderRadius: 8, background: "var(--panel)" }}>
          {(["en", "ar"] as Lang[]).map((l) => (
            <button key={l} onClick={() => pickLang(l)} aria-pressed={lang === l} style={seg(lang === l)}>{l === "en" ? "English" : "العربية"}</button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", padding: 2, border: "1px solid var(--line)", borderRadius: 8, background: "var(--panel)", flexWrap: "wrap" }}>
          {(["all", "updates", "published", "scheduled", "approved", "review"] as FilterKey[]).map((k) => (
            <button key={k} onClick={() => setFilter(k)} aria-pressed={filter === k} style={seg(filter === k)}>
              {t.f[k]}<span className="so-mono" style={{ fontSize: 11, color: "var(--text3)" }}>{items.filter((i) => matches(i, k)).length}</span>
            </button>
          ))}
        </div>
        {usedPlatforms.length ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <button onClick={() => setChans([])} aria-pressed={!chans.length} style={{ height: 30, padding: "0 10px", border: `1px solid ${chans.length ? "var(--line)" : "var(--accent)"}`, borderRadius: 8, background: chans.length ? "var(--panel)" : "var(--accentSoft)", color: "var(--text)", fontSize: 12, fontWeight: 500, cursor: "pointer" }}>{t.chAll}</button>
            {usedPlatforms.map((p) => {
              const on = chans.includes(p);
              return (
                <button key={p} onClick={() => setChans((c) => (on ? c.filter((x) => x !== p) : [...c, p]))} aria-pressed={on} title={platformOf(p).name}
                  style={{ height: 30, display: "flex", alignItems: "center", gap: 7, padding: "0 10px", border: `1px solid ${on ? "var(--accent)" : "var(--line)"}`, borderRadius: 8, background: on ? "var(--accentSoft)" : "var(--panel)", color: on ? "var(--text)" : "var(--text2)", fontSize: 12, fontWeight: 500, cursor: "pointer" }}>
                  <Glyph name={platformOf(p).glyph} />{platformOf(p).name}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "999 1 520px", minWidth: 0, display: "flex", flexDirection: "column", gap: 18 }}>
          {canPost ? (
            <section style={{ ...card, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                {avatar(me)}
                <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={draft ? 3 : 1} placeholder={t.composerPh} aria-label={t.composerPh} dir="auto"
                  onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void postUpdate(); }}
                  style={{ flex: 1, minWidth: 0, padding: "8px 10px", border: "1px solid var(--line2)", borderRadius: 10, background: "var(--bg)", color: "var(--text)", resize: "vertical", lineHeight: 1.55, fontSize: 13.5, outline: "none", font: "inherit" }} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", paddingInlineStart: 46 }}>
                <div role="group" style={{ display: "flex", padding: 2, border: "1px solid var(--line)", borderRadius: 8, background: "var(--bg)" }}>
                  {(["PUBLIC", "PRIVATE"] as UpdateVisibility[]).map((v) => (
                    <button key={v} onClick={() => setVis(v)} aria-pressed={vis === v} style={{ ...seg(vis === v), height: 26, fontSize: 12 }}>{t.vis[v]}</button>
                  ))}
                </div>
                <span style={{ flex: "1 1 200px", fontSize: 12, color: "var(--text3)" }}>{t.composerNote}</span>
                {draft ? <span className="so-mono" style={{ fontSize: 11.5, color: draft.length > 1000 ? "var(--red)" : "var(--text3)" }}>{draft.length}/1000</span> : null}
                <button className="so-btn" data-variant="primary" style={{ height: 32 }} onClick={() => void postUpdate()} disabled={posting || !draft.trim() || draft.length > 1000}>
                  {posting ? t.posting : t.post}
                </button>
              </div>
            </section>
          ) : (
            <div className="so-frame" style={{ fontSize: 12 }}>{t.readOnly}</div>
          )}

          {!items.length ? (
            <section style={{ border: "1px dashed var(--line2)", borderRadius: 12, background: "var(--panel)", padding: "40px 20px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{t.emptyTitle}</div>
              <div style={{ color: "var(--text2)", maxWidth: 420 }}>{t.emptyBody}</div>
            </section>
          ) : !groups.length ? (
            <section style={{ border: "1px dashed var(--line2)", borderRadius: 12, padding: "28px 20px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, color: "var(--text2)" }}>
              <span>{t.noMatch}</span>
              <button className="so-btn" onClick={() => { setFilter("all"); setChans([]); }}>{t.clear}</button>
            </section>
          ) : null}

          {groups.map((g) => (
            <div key={g.key} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span aria-hidden="true" style={{ width: 11, height: 11, flex: "none", borderRadius: "50%", border: "2px solid var(--accent)", background: "var(--bg)" }} />
                <span className="so-mono" style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--text2)" }}>{t.days[g.key]}</span>
                <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
                <span className="so-mono" style={{ fontSize: 11, color: "var(--text3)" }}>{g.items.length}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginInlineStart: 5, paddingInlineStart: 22, borderInlineStart: "1px solid var(--line)" }}>
                {g.items.map(renderItem)}
              </div>
            </div>
          ))}
        </div>

        <div style={{ flex: "1 1 280px", minWidth: 0, maxWidth: "100%", display: "flex", flexDirection: "column", gap: 16 }}>
          <section style={{ ...card, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontWeight: 600 }}>{t.week}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8 }}>
              {stats.map((s) => (
                <div key={s.label} style={{ padding: 10, border: "1px solid var(--line)", borderRadius: 10, background: "var(--bg)" }}>
                  <div className="so-mono" style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em" }}>{s.value}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text3)" }}>{s.label}</div>
                </div>
              ))}
            </div>
          </section>

          <section style={{ ...card, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid var(--line)" }}>
              <span style={{ fontWeight: 600 }}>{t.next}</span>
              <Link href="/socialork/publishing" style={{ fontSize: 12, fontWeight: 600 }}>{t.openCal}</Link>
            </div>
            {data.upNext.length ? data.upNext.map((u, i) => (
              <button key={u.id} onClick={() => setDrawer(posts.some((p) => p.id === u.id) ? u.id : null)}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", border: 0, borderTop: i ? "1px solid var(--line)" : 0, background: "none", color: "var(--text)", textAlign: "start", cursor: "pointer" }}>
                <span style={{ width: 26, height: 26, flex: "none", borderRadius: 7, border: "1px solid var(--line2)", display: "grid", placeItems: "center", color: "var(--text2)" }}><Glyph name={platformOf(u.platform).glyph} /></span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 12.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{u.title}</span>
                  <span style={{ display: "block", fontSize: 11.5, color: "var(--text3)" }}>{platformOf(u.platform).name} · {u.status === "APPROVED" ? t.needsSlot : t.st.scheduled}</span>
                </span>
                <span className="so-mono" style={{ fontSize: 11.5, color: "var(--text2)", whiteSpace: "nowrap" }}>{u.at ? when(u.at) : "—"}</span>
              </button>
            )) : <div className="so-empty">{t.nothingNext}</div>}
          </section>

          {top && top.reactions.length ? (
            <section style={{ ...card, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontWeight: 600 }}>{t.top}</div>
              <button onClick={() => setDrawer(top.id)} style={{ padding: 12, border: "1px solid var(--line)", borderRadius: 10, background: "var(--bg)", color: "var(--text)", textAlign: "start", display: "flex", flexDirection: "column", gap: 6, cursor: "pointer" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text3)" }}><Glyph name={platformOf(top.platform).glyph} />{platformOf(top.platform).name} · {nameOf(top.authorId)}</span>
                <span style={{ fontWeight: 600, lineHeight: 1.35 }}>{top.title || top.body.slice(0, 90)}</span>
                <span className="so-mono" style={{ fontSize: 12, color: "var(--accent)" }}>{t.reactions(top.reactions.length)}</span>
              </button>
            </section>
          ) : null}
        </div>
      </div>

      {drawerPost ? (
        <Portal dir={lang === "ar" ? "rtl" : "ltr"}>
          <div onClick={() => setDrawer(null)} style={{ position: "fixed", inset: 0, zIndex: 40, background: "rgba(0,0,0,.45)" }} />
          <aside role="dialog" aria-modal="true" aria-label={t.details}
            style={{ position: "fixed", top: 0, bottom: 0, insetInlineEnd: 0, zIndex: 41, width: "min(440px,100%)", background: "var(--panel)", borderInlineStart: "1px solid var(--line2)", boxShadow: "0 0 80px rgba(0,0,0,.5)", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: "1px solid var(--line)" }}>
              <span style={{ flex: 1, fontWeight: 600 }}>{t.details}</span>
              <button className="so-btn" style={{ height: 30 }} onClick={() => setDrawer(null)}>{t.close}</button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 18, display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.35 }}>{drawerPost.title || t.details}</div>
              <div style={{ display: "grid", gridTemplateColumns: "110px minmax(0,1fr)", gap: "8px 12px", fontSize: 12.5 }}>
                <span style={{ color: "var(--text3)" }}>{t.dChannel}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Glyph name={platformOf(drawerPost.platform).glyph} />{platformOf(drawerPost.platform).name}</span>
                <span style={{ color: "var(--text3)" }}>{t.dStatus}</span>
                <span>{pill(statusOf(drawerPost))}</span>
                <span style={{ color: "var(--text3)" }}>{t.dAuthor}</span>
                <span>{nameOf(drawerPost.authorId)}</span>
                {drawerPost.handle ? (<><span style={{ color: "var(--text3)" }}>{t.dAccount}</span><span>{drawerPost.handle}</span></>) : null}
              </div>
              <div dir="auto" style={{ fontSize: 13.5, lineHeight: 1.65, whiteSpace: "pre-line", padding: 14, border: "1px solid var(--line)", borderRadius: 10, background: "var(--bg)", overflowWrap: "anywhere" }}>{drawerPost.body}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div className="so-mono" style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--text3)" }}>{t.dTrail}</div>
                {[
                  { text: t.trail.created(nameOf(drawerPost.authorId)), at: drawerPost.createdAt, c: "var(--text3)" },
                  drawerPost.status === "PENDING_APPROVAL"
                    ? { text: t.trail.wait, at: null, c: "var(--amber)" }
                    : { text: t.trail.appr(drawerPost.approvedBy ? nameOf(drawerPost.approvedBy) : "—"), at: drawerPost.approvedAt, c: "var(--accent)" },
                  drawerPost.status === "PUBLISHED" ? { text: t.trail.pub(platformOf(drawerPost.platform).name), at: drawerPost.publishedAt, c: "var(--green)" } : null,
                  drawerPost.status === "SCHEDULED" ? { text: t.trail.sched, at: drawerPost.scheduledFor, c: "var(--blue)" } : null,
                  drawerPost.status === "APPROVED" ? { text: t.trail.slot, at: null, c: "var(--text3)" } : null,
                ].filter((x): x is { text: string; at: string | null; c: string } => Boolean(x)).map((s, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12.5 }}>
                    <span style={{ width: 8, height: 8, flex: "none", borderRadius: "50%", background: s.c }} />
                    <span style={{ flex: 1 }}>{s.text}</span>
                    <span className="so-mono" style={{ fontSize: 11, color: "var(--text3)" }}>{s.at ? when(s.at) : ""}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {drawerPost.url ? <a className="so-btn" href={drawerPost.url} target="_blank" rel="noreferrer" style={{ height: 32 }}>{t.view(platformOf(drawerPost.platform).name)}</a> : null}
                <Link className="so-btn" href={`/socialork/drafts/${drawerPost.id}`} style={{ height: 32 }}>{t.openDraft}</Link>
              </div>
            </div>
          </aside>
        </Portal>
      ) : null}

      {toast ? (
        <Portal><div role="status" style={{ position: "fixed", bottom: 24, left: "50%", zIndex: 50, transform: "translateX(-50%)", padding: "10px 16px", borderRadius: 10, border: `1px solid ${toast.err ? "var(--red)" : "var(--line2)"}`, background: "var(--panel2)", boxShadow: "0 20px 50px rgba(0,0,0,.5)", fontSize: 13, color: toast.err ? "var(--red)" : "var(--text)" }}>
          {toast.text}
        </div></Portal>
      ) : null}
    </div>
  );
}
