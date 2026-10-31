"use client";

/**
 * The SocialOrk application shell: 232px sidebar, topbar with ⌘K palette, and
 * the workspace/brain switcher. Structure and spacing follow the Claude Design
 * handoff (SocialOrk.dc.html); the data is the caller's real workspace.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { WorkspaceSwitcher } from "@/components/socialork/workspace-switcher";
import {
  Blocks, BookOpen, CalendarClock, ChevronDown, CircleDot, Command, FileText,
  Inbox, LayoutDashboard, PenLine, Settings, ShieldCheck, Sparkles, Users,
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
  children,
}: {
  workspaceName: string;
  role: string;
  userName: string;
  email: string;
  brains: number;
  accounts: number;
  counts: NavCounts;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [viewAs, setViewAs] = useState<string | null>(null);
  const [userMenu, setUserMenu] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const nav: { label?: string; items: NavItem[] }[] = [
    {
      items: [
        { href: "/socialork/overview", label: "Overview", icon: LayoutDashboard },
        { href: "/socialork/create", label: "Create", icon: PenLine },
        { href: "/socialork/studio", label: "AI Studio", icon: Sparkles },
        { href: "/socialork/drafts", label: "Drafts", icon: FileText, count: counts.drafts },
        { href: "/socialork/approvals", label: "Approvals", icon: ShieldCheck, count: counts.review, tone: "amber" },
        {
          href: "/socialork/publishing", label: "Publishing", icon: CalendarClock,
          count: counts.failed > 0 ? counts.failed : counts.scheduled,
          tone: counts.failed > 0 ? "red" : undefined,
          hint: counts.failed > 0 ? `${counts.failed} failed` : `${counts.scheduled} scheduled`,
        },
      ],
    },
    {
      label: "Listen",
      items: [
        { href: "/socialork/feed", label: "Timeline", icon: CircleDot },
        { href: "/socialork/inbox", label: "Inbox", icon: Inbox },
      ],
    },
    { label: "Learn", items: [{ href: "/socialork/insights", label: "Insights", icon: CircleDot }] },
    {
      label: "Workspace",
      items: [
        { href: "/socialork/workspaces", label: "Workspaces", icon: Blocks },
        { href: "/socialork/brains", label: "Brains", icon: BookOpen, count: brains },
        { href: "/socialork/team", label: "Team", icon: Users },
        { href: "/socialork/settings", label: "Settings", icon: Settings, count: accounts },
      ],
    },
  ];

  const flat = useMemo(() => nav.flatMap((g) => g.items), [nav]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
      if (e.key === "Escape") setPaletteOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
    <div className="so-root">
      <aside className="so-side">
        <div className="so-brand">
          {/* the product's existing mascot mark */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/socialork-logo.svg" alt="SocialOrk" width={26} height={24} className="so-brand-img" />
          <span className="so-brand-name">
            Social<span style={{ color: "var(--accent)" }}>Ork</span>
          </span>
        </div>

        <WorkspaceSwitcher currentName={workspaceName} brains={brains} accounts={accounts} />

        <nav className="so-nav">
          {nav.map((group, gi) => (
            <div key={group.label ?? `g${gi}`} style={{ display: "grid", gap: 1 }}>
              {group.label ? <div className="so-nav-label">{group.label}</div> : null}
              {group.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = item.icon;
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    className="so-nav-item"
                    data-active={active}
                    title={item.hint}
                  >
                    <Icon size={15} strokeWidth={1.8} />
                    <span>{item.label}</span>
                    {typeof item.count === "number" && item.count > 0 ? (
                      <span className="so-nav-count" data-tone={item.tone}>{item.count}</span>
                    ) : null}
                  </a>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="so-side-foot" style={{ position: "relative" }}>
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
              gap: 8, width: "100%", padding: 4, borderRadius: 8, border: 0,
              background: userMenu ? "var(--panel2)" : "transparent", color: "inherit", cursor: "pointer", textAlign: "left",
            }}
          >
            <span
              style={{
                width: 24, height: 24, borderRadius: 999, display: "grid", placeItems: "center",
                background: "var(--panel2)", border: "1px solid var(--line2)",
                font: "600 10px var(--font-plex-mono), monospace", color: "var(--text2)", flex: "none",
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
        </div>
      </aside>

      <div className="so-main">
        <header className="so-top">
          <span className="so-crumb">
            <b>{workspaceName}</b>
            <span>/</span>
            <span>{current?.label ?? "Overview"}</span>
          </span>

          <button className="so-search" onClick={() => setPaletteOpen(true)}>
            <Command size={13} strokeWidth={2} />
            Search
            <span className="so-kbd">⌘K</span>
          </button>

          <label className="so-viewas" style={{ cursor: "pointer" }}>
            View as
            <select
              value={viewAs ?? role.toUpperCase()}
              onChange={(e) => setViewAs(e.target.value === role.toUpperCase() ? null : e.target.value)}
              style={{
                height: 24, borderRadius: 7, border: "1px solid var(--line2)", background: "var(--panel2)",
                color: "var(--text2)", fontSize: 11.5, padding: "0 6px", fontFamily: "inherit",
              }}
            >
              {["ADMIN", "MANAGER", "EDITOR", "VIEWER"].map((r) => (
                <option key={r} value={r}>{r.toLowerCase()}</option>
              ))}
            </select>
          </label>
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
                      <span>{item.label}</span>
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
