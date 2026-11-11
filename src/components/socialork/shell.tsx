"use client";

/**
 * The SocialOrk application shell: 232px sidebar, topbar with ⌘K palette, and
 * the workspace/brain switcher. Structure and spacing follow the Claude Design
 * handoff (SocialOrk.dc.html); the data is the caller's real workspace.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { tr, LANG_COOKIE, type Lang } from "@/lib/socialork/i18n";
import { ToastHost } from "@/components/socialork/undo-toast";
import { Bell, LogOut, Menu, Moon, Plus, Sun, X } from "lucide-react";
import { WorkspaceSwitcher } from "@/components/socialork/workspace-switcher";
import { BrainSwitcher } from "@/components/socialork/brain-switcher";
import {
  Blocks, BookOpen, CalendarClock, ChevronDown, CircleDot, Command, FileText,
  ImageIcon, Inbox, LayoutDashboard, TrendingUp, Workflow, Zap, PanelsTopLeft, PenLine, Settings, ShieldCheck, Sparkles, Users,
} from "lucide-react";

export type NavCounts = {
  drafts: number;
  review: number;
  approved: number;
  scheduled: number;
  failed: number;
};

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number | string; strokeWidth?: number }>;
  count?: number;
  tone?: "amber" | "red";
  hint?: string;
};

export function Shell({
  workspaceName,
  role,
  userName,
  email,
  brains,
  accounts,
  counts,
  brainsList = [],
  activeBrainId: activeBrain = "",
  lang = "en",
  children,
}: {
  workspaceName: string;
  role: string;
  userName: string;
  email: string;
  brains: number;
  accounts: number;
  counts: NavCounts;
  brainsList?: { id: string; name: string; isDefault: boolean }[];
  activeBrainId?: string;
  lang?: Lang;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [viewAs, setViewAs] = useState<string | null>(null);
  const [userMenu, setUserMenu] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const bellRef = useRef<HTMLSpanElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Everyday work stays visible; the rest folds into two groups that open
  // themselves when you are inside one of their pages.
  const nav: { label?: string; fold?: boolean; items: NavItem[] }[] = [
    {
      items: [
        { href: "/socialork/overview", label: "Overview", icon: LayoutDashboard },
        { href: "/socialork/create", label: "Create", icon: PenLine },
        { href: "/socialork/drafts", label: "Drafts", icon: FileText, count: counts.drafts },
        { href: "/socialork/approvals", label: "Approvals", icon: ShieldCheck, count: counts.review, tone: "amber" },
        {
          href: "/socialork/publishing", label: "Publishing", icon: CalendarClock,
          count: counts.failed,
          tone: counts.failed > 0 ? "red" : undefined,
          hint: counts.failed > 0 ? `${counts.failed} failed` : undefined,
        },
        { href: "/socialork/inbox", label: "Inbox", icon: Inbox },
        { href: "/socialork/insights", label: "Insights", icon: TrendingUp },
      ],
    },
    {
      label: "Automate & grow",
      fold: true,
      items: [
        { href: "/socialork/studio", label: "AI Studio", icon: Sparkles },
        { href: "/socialork/autopilot", label: "Autopilot", icon: Zap },
        { href: "/socialork/automations", label: "Automations", icon: Workflow },
        { href: "/socialork/market-intel", label: "Market Intel", icon: TrendingUp },
        { href: "/socialork/feed", label: "Timeline", icon: CircleDot },
      ],
    },
    {
      label: "Workspace",
      fold: true,
      items: [
        { href: "/socialork/brains", label: "Brains", icon: BookOpen },
        { href: "/socialork/media", label: "Media", icon: ImageIcon },
        { href: "/socialork/portfolio", label: "Portfolio", icon: PanelsTopLeft },
        { href: "/socialork/workspaces", label: "Workspaces", icon: Blocks },
        { href: "/socialork/team", label: "Team", icon: Users },
        { href: "/socialork/settings", label: "Settings", icon: Settings },
      ],
    },
  ];
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const flat = useMemo(() => nav.flatMap((g) => g.items), [nav]);

  useEffect(() => {
    const saved = window.localStorage.getItem("so-theme");
    if (saved === "light" || saved === "dark") setTheme(saved);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
      if (e.key === "Escape") { setPaletteOpen(false); setBellOpen(false); }
    };
    const onDown = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, []);

  // Notifications are derived from the real queue counts, nothing is invented.
  const notes: { href: string; text: string; tone: "amber" | "red" | "green" }[] = [];
  if (counts.failed > 0)
    notes.push({ href: "/socialork/publishing", text: `${counts.failed} ${counts.failed === 1 ? "post" : "posts"} failed to publish`, tone: "red" });
  if (counts.review > 0)
    notes.push({ href: "/socialork/approvals", text: `${counts.review} ${counts.review === 1 ? "post is" : "posts are"} waiting for approval`, tone: "amber" });
  if (counts.approved > 0)
    notes.push({ href: "/socialork/publishing", text: `${counts.approved} approved, ready to schedule`, tone: "green" });
  const unread = counts.failed + counts.review;

  useEffect(() => {
    if (paletteOpen) setTimeout(() => inputRef.current?.focus(), 20);
    else setQuery("");
  }, [paletteOpen]);

  const results = flat.filter((i) => i.label.toLowerCase().includes(query.trim().toLowerCase()));
  const current = flat.find((i) => pathname.startsWith(i.href));
  const initials = (userName || email || "?")
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const go = (href: string) => {
    setPaletteOpen(false);
    router.push(href);
  };

  return (
    <div className="so-root" data-nav={navOpen ? "open" : "closed"} data-theme={theme}>
      <button type="button" className="so-backdrop" aria-label="Close navigation" onClick={() => setNavOpen(false)} />
      <aside className="so-side">
        <div className="so-brand">
          {/* the product's existing mascot mark */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/socialork/orc-logo.png" alt="" width={28} height={28} className="so-brand-img" style={{ borderRadius: 8 }} />
          <span className="so-brand-name">SocialOrk</span>
        </div>

        <WorkspaceSwitcher currentName={workspaceName} brains={brains} accounts={accounts} />
        <BrainSwitcher brains={brainsList} activeId={activeBrain} />

        <nav className="so-nav">
          {nav.map((group, gi) => {
            const holdsActive = group.items.some((i) => pathname === i.href || pathname.startsWith(`${i.href}/`));
            const key = group.label ?? `g${gi}`;
            const open = !group.fold || holdsActive || openGroups[key] === true;
            const badge = group.items.reduce((n, i) => n + (typeof i.count === "number" ? i.count : 0), 0);
            return (
              <div key={key} style={{ display: "grid", gap: 1 }}>
                {group.label ? (
                  group.fold ? (
                    <button type="button" className="so-nav-label" aria-expanded={open}
                      data-testid={`nav-fold-${gi}`}
                      onClick={() => setOpenGroups((g) => ({ ...g, [key]: !open }))}
                      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", border: 0, background: "transparent", cursor: "pointer", textAlign: "start" }}>
                      <span>{tr(lang, group.label)}</span>
                      <span style={{ fontSize: 10, opacity: 0.7 }}>{!open && badge > 0 ? `${badge} · ` : ""}{open ? "▾" : "▸"}</span>
                    </button>
                  ) : (
                    <div className="so-nav-label">{tr(lang, group.label)}</div>
                  )
                ) : null}
                {open ? group.items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const Icon = item.icon;
                  return (
                    <a key={item.href} href={item.href} className="so-nav-item" data-active={active} title={item.hint}>
                      <Icon size={16} strokeWidth={1.8} />
                      <span style={{ flex: 1 }}>{tr(lang, item.label)}</span>
                      {typeof item.count === "number" && item.count > 0 ? (
                        <span className="so-nav-count" data-tone={item.tone}>{item.count}</span>
                      ) : null}
                    </a>
                  );
                }) : null}
              </div>
            );
          })}
        </nav>

        <div className="so-side-foot" style={{ position: "relative", display: "flex", alignItems: "center", gap: 4 }}>
          {userMenu ? (
            <div
              className="so-card so-palette"
              style={{
                position: "absolute", bottom: "calc(100% - 4px)", left: 10, right: 10, padding: 6,
                boxShadow: "var(--shadow)", zIndex: 20, display: "grid", gap: 2,
              }}
            >
              <div style={{ padding: "6px 8px", display: "grid", gap: 1 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{userName || email}</span>
                <span className="so-mono" style={{ fontSize: 10.5, color: "var(--text3)" }}>
                  {email} · {role.toLowerCase()}
                </span>
              </div>
              <div className="so-divider" />
              <a href="/socialork/settings" className="so-nav-item" style={{ height: 28 }} onClick={() => setUserMenu(false)}>
                Profile &amp; settings
              </a>
              <a href="/socialork/settings/ai" className="so-nav-item" style={{ height: 28 }} onClick={() => setUserMenu(false)}>
                AI keys
              </a>
              <a href="/socialork/brains" className="so-nav-item" style={{ height: 28 }} onClick={() => setUserMenu(false)}>
                Brains
              </a>
              <div className="so-divider" />
              <button
                className="so-nav-item"
                style={{ height: 28, border: 0, background: "transparent", cursor: "pointer", width: "100%", color: "var(--red)" }}
                onClick={() => signOut({ callbackUrl: "/signin" })}
              >
                Sign out
              </button>
            </div>
          ) : null}

          <button
            className="so-row"
            onClick={() => setUserMenu((v) => !v)}
            aria-expanded={userMenu}
            aria-haspopup="menu"
            style={{
              gap: 8, flex: 1, minWidth: 0, padding: 4, borderRadius: 8, border: 0,
              background: userMenu ? "var(--panel2)" : "transparent", color: "inherit", cursor: "pointer", textAlign: "left",
            }}
          >
            <span
              style={{
                width: 30, height: 30, borderRadius: "50%", display: "grid", placeItems: "center",
                background: "var(--accentSoft)", color: "var(--accentText)",
                fontSize: 11, fontWeight: 600, flex: "none",
              }}
            >{initials}</span>
            <span style={{ display: "grid", minWidth: 0 }}>
              <span style={{ fontSize: 12, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {userName || email}
              </span>
              <span className="so-brain-meta">{role.toLowerCase()}</span>
            </span>
            <ChevronDown size={13} strokeWidth={2} style={{ marginLeft: "auto", color: "var(--text3)", flex: "none" }} />
          </button>
          <button
            type="button"
            className="so-btn"
            data-variant="ghost"
            aria-label="Sign out"
            title="Sign out"
            onClick={() => signOut({ callbackUrl: "/signin" })}
            style={{ width: 28, height: 28, padding: 0, flex: "none", display: "grid", placeItems: "center" }}
          >
            <LogOut size={15} strokeWidth={1.8} />
          </button>
        </div>
      </aside>

      <div className="so-main">
        <header className="so-top">
          <button
            type="button"
            className="so-btn so-nav-toggle"
            aria-label={navOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={navOpen}
            onClick={() => setNavOpen((open) => !open)}
            style={{ width: 32, padding: 0 }}
          >
            {navOpen ? <X size={16} /> : <Menu size={16} />}
          </button>
          <span className="so-crumb">
            <b>{workspaceName}</b>
            <span>/</span>
            <span style={{ fontWeight: 600, color: "var(--text)" }}>{tr(lang, current?.label ?? "Overview")}</span>
          </span>
          <div style={{ flex: 1 }} />

          <button className="so-search" onClick={() => setPaletteOpen(true)}>
            <Command size={13} strokeWidth={2} />
            <span className="so-search-text" style={{ flex: 1, textAlign: "start" }}>{tr(lang, "Search")}</span>
            <span className="so-kbd">⌘K</span>
          </button>

          <div className="so-viewas" role="group" aria-label="View as">
            <span>{tr(lang, "View as")}</span>
            <div style={{ display: "flex", padding: 2, border: "1px solid var(--line)", borderRadius: 8, background: "var(--panel)" }}>
              {["Admin", "Manager", "Editor"].map((r) => {
                const on = (viewAs ?? role).toLowerCase() === r.toLowerCase();
                return (
                  <button
                    key={r}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setViewAs(r.toLowerCase() === role.toLowerCase() ? null : r.toUpperCase())}
                    style={{
                      height: 26, padding: "0 10px", border: 0, borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 500,
                      fontFamily: "inherit", background: on ? "var(--panel2)" : "transparent", color: on ? "var(--text)" : "var(--text2)",
                    }}
                  >
                    {r}
                  </button>
                );
              })}
            </div>
          </div>


          <span ref={bellRef} style={{ position: "relative" }}>
            <button
              type="button"
              className={`so-btn${unread > 0 ? " so-bell-has" : ""}`}
              aria-label="Notifications"
              aria-expanded={bellOpen}
              aria-haspopup="dialog"
              title="Notifications"
              onClick={() => setBellOpen((v) => !v)}
              style={{ width: 32, padding: 0, position: "relative", display: "grid", placeItems: "center" }}
            >
              <Bell size={15} strokeWidth={1.8} />
              {unread > 0 ? (
                <span
                  className="so-bell-badge"
                  style={{
                    position: "absolute", top: -5, insetInlineEnd: -5, minWidth: 17, height: 17, padding: "0 4px",
                    borderRadius: 9, background: "var(--red)", color: "#fff",
                    font: "600 10px/17px var(--font-plex-mono), monospace", textAlign: "center",
                  }}
                >{unread}</span>
              ) : null}
            </button>
            {bellOpen ? (
              <div
                role="dialog"
                aria-label="Notifications"
                className="so-palette"
                style={{
                  position: "absolute", top: 40, insetInlineEnd: 0, zIndex: 45, width: "min(360px, calc(100vw - 24px))",
                  border: "1px solid var(--line2)", borderRadius: 12, background: "var(--panel)",
                  boxShadow: "var(--shadow)", overflow: "hidden",
                }}
              >
                <div className="so-row" style={{ padding: "12px 14px", borderBottom: "1px solid var(--line)" }}>
                  <span style={{ fontWeight: 600, flex: 1 }}>Notifications</span>
                  <a href="/socialork/settings" style={{ fontSize: 12, color: "var(--text3)" }} onClick={() => setBellOpen(false)}>Settings</a>
                </div>
                {notes.length === 0 ? (
                  <div style={{ padding: "28px 16px", textAlign: "center", color: "var(--text3)", fontSize: 12.5 }}>
                    Nothing needs you right now.
                  </div>
                ) : (
                  notes.map((n) => (
                    <a
                      key={n.text}
                      href={n.href}
                      className="so-nav-item"
                      onClick={() => setBellOpen(false)}
                      style={{ height: "auto", padding: "11px 14px", borderRadius: 0, borderTop: "1px solid var(--line)", gap: 10 }}
                    >
                      <span style={{ width: 7, height: 7, borderRadius: "50%", flex: "none", background: n.tone === "red" ? "var(--red)" : n.tone === "amber" ? "var(--amber)" : "var(--green)" }} />
                      <span style={{ fontSize: 12.5, lineHeight: 1.45 }}>{n.text}</span>
                    </a>
                  ))
                )}
              </div>
            ) : null}
          </span>

          <button
            type="button"
            className="so-btn"
            title={tr(lang, "Language")}
            aria-label="Language"
            data-testid="lang-toggle"
            onClick={() => {
              document.cookie = `${LANG_COOKIE}=${lang === "ar" ? "en" : "ar"}; path=/; max-age=31536000; samesite=lax`;
              window.location.reload();
            }}
            style={{ width: 32, padding: 0, fontSize: 12, fontWeight: 600 }}
          >
            {lang === "ar" ? "EN" : "ع"}
          </button>

          <button
            type="button"
            className="so-btn"
            title="Toggle light / dark"
            aria-label="Toggle light / dark"
            onClick={() => {
              const next = theme === "dark" ? "light" : "dark";
              setTheme(next);
              window.localStorage.setItem("so-theme", next);
            }}
            style={{ width: 32, padding: 0, display: "grid", placeItems: "center" }}
          >
            {theme === "dark" ? <Sun size={15} strokeWidth={1.8} /> : <Moon size={15} strokeWidth={1.8} />}
          </button>

          <a href="/socialork/create" className="so-btn" data-variant="primary" style={{ gap: 6, textDecoration: "none" }}>
            <Plus size={14} strokeWidth={2.4} />
            <span className="so-hide-sm">{tr(lang, "New post")}</span>
          </a>
        </header>

        {viewAs ? (
          <div
            style={{
              display: "flex", alignItems: "center", gap: 10, padding: "6px 16px",
              background: "var(--amberSoft)", color: "var(--amber)", fontSize: 11.5,
              borderBottom: "1px solid var(--line)",
            }}
          >
            <span>
              Previewing as <b>{viewAs.toLowerCase()}</b> — this only changes the label. Permissions
              are enforced by the server on every request, so nothing is actually hidden.
            </span>
            <button
              onClick={() => setViewAs(null)}
              style={{ marginLeft: "auto", background: "transparent", border: 0, color: "inherit", cursor: "pointer", fontSize: 11.5 }}
            >
              Exit preview
            </button>
          </div>
        ) : null}

        <div className="so-scroll">{children}</div>

        {/* Phone only: the four places people go all day, plus the full menu. */}
        <ToastHost />
        <nav className="so-tabbar" aria-label="Quick navigation">
          {[
            { href: "/socialork/overview", label: "Overview", Icon: LayoutDashboard, count: 0 },
            { href: "/socialork/create", label: "Create", Icon: PenLine, count: 0 },
            { href: "/socialork/approvals", label: "Approvals", Icon: ShieldCheck, count: counts.review },
            { href: "/socialork/inbox", label: "Inbox", Icon: Inbox, count: 0 },
          ].map(({ href, label, Icon, count }) => (
            <a
              key={href}
              href={href}
              data-active={pathname === href || pathname.startsWith(`${href}/`)}
              aria-label={tr(lang, label)}
            >
              <Icon size={20} strokeWidth={1.9} />
              <span>{tr(lang, label)}</span>
              {count > 0 ? <span className="so-tab-count">{count}</span> : null}
            </a>
          ))}
          <button type="button" data-active={navOpen} aria-label="Menu" aria-expanded={navOpen} onClick={() => setNavOpen((open) => !open)}>
            <Menu size={20} strokeWidth={1.9} />
            <span>{tr(lang, "Menu")}</span>
          </button>
        </nav>
      </div>

      {paletteOpen ? (
        <div
          onClick={() => setPaletteOpen(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 60, background: "rgba(5,5,8,0.62)",
            display: "flex", justifyContent: "center", alignItems: "flex-start", paddingTop: "12vh",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="so-palette"
            style={{
              width: "min(560px, 92vw)", background: "var(--panel)", border: "1px solid var(--line2)",
              borderRadius: 12, boxShadow: "var(--shadow)", overflow: "hidden",
            }}
          >
            <div className="so-row" style={{ padding: "10px 12px", borderBottom: "1px solid var(--line)" }}>
              <Command size={14} strokeWidth={2} style={{ color: "var(--text3)" }} />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && results[0]) go(results[0].href);
                }}
                placeholder="Go to a page…"
                style={{ flex: 1, background: "transparent", border: 0, color: "var(--text)", fontSize: 13, outline: "none" }}
              />
              <span className="so-kbd">esc</span>
            </div>
            <div style={{ maxHeight: 320, overflowY: "auto", padding: 6 }}>
              {results.length === 0 ? (
                <div className="so-empty">No page matches “{query}”.</div>
              ) : (
                results.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.href}
                      onClick={() => go(item.href)}
                      className="so-nav-item"
                      style={{ width: "100%", border: 0, background: "transparent", cursor: "pointer", height: 34 }}
                    >
                      <Icon size={15} strokeWidth={1.8} />
                      <span>{tr(lang, item.label)}</span>
                      <span className="so-brain-meta" style={{ marginLeft: "auto" }}>{item.href}</span>
                    </button>
                  );
                })
              )}
            </div>
            <div
              className="so-row"
              style={{ padding: "8px 12px", borderTop: "1px solid var(--line)", color: "var(--text3)", fontSize: 11 }}
            >
              <span>↵ to open</span>
              <span style={{ flex: 1 }} />
              <span>⌘K anywhere</span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function Badge({ label, tone }: { label: string; tone: string }) {
  return <span className="so-pill" data-tone={tone}>{label}</span>;
}
