"use client";

import { Suspense, useCallback, useEffect, useState, type ReactNode, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Platform } from "@prisma/client";
import { ArrowUpRight, Bell, Check, CreditCard, Globe2, Link2, Loader2, LockKeyhole, Palette, Pencil, RefreshCw, Save, Settings2, ShieldCheck, SlidersHorizontal, Trash2, UserRound, UsersRound, Unlink, X } from "lucide-react";
import { Header } from "@/components/dashboard/header";
import { OrcMark } from "@/components/icons/orc-mark";
import { platformIcons } from "@/components/icons/platform-icons";
import { PLATFORM_CONFIGS } from "@/types/platform";
import { isRole, parseRole, permissionsFor, ROLE_META, type Permission } from "@/lib/roles";

const PERMISSION_LABELS: Record<Permission, string> = {
  "dashboard:view": "View the dashboard",
  "posts:create": "Create draft posts",
  "posts:submit": "Submit posts for approval",
  "posts:approve": "Approve or reject posts",
  "posts:schedule": "Schedule approved posts",
  "posts:delete": "Delete posts",
  "accounts:connect": "Connect social accounts",
  "users:manage": "Manage team members",
  "engagement:view": "View engagement inbox",
  "engagement:reply": "Reply to comments and messages",
  "engagement:react": "React to posts and comments",
  "engagement:delete": "Delete comments and reactions",
};

type Profile = { name: string | null; email: string | null; timezone: string; role: string };
type PlatformStatus = {
  platform: Platform; configured: boolean; connected: boolean; missingCredentials: string[];
  accounts: { id: string; displayName?: string; platformUsername?: string; isActive: boolean }[];
};
type Brain = { id: string; name: string; isDefault: boolean; connectedAccounts: number };
const sections = [
  { key: "workspace", target: "workspace", label: "Workspace", icon: Settings2 },
  { key: "team", target: "access", label: "Team", icon: UsersRound },
  { key: "permissions", target: "permissions", label: "Permissions", icon: LockKeyhole },
  { key: "integrations", target: "integrations", label: "Integrations", icon: Link2 },
  { key: "notifications", target: "notifications", label: "Notifications", icon: Bell },
  { key: "billing", target: "billing", label: "Billing", icon: CreditCard },
  { key: "brand", target: "brand", label: "Brand", icon: Palette },
  { key: "security", target: "security", label: "Security", icon: ShieldCheck },
];
function Panel({ id, title, subtitle, icon, children, className = "" }: { id: string; title: string; subtitle: string; icon: ReactNode; children: ReactNode; className?: string }) {
  return <section id={id} className={`settings-panel ${className}`} aria-labelledby={`${id}-title`}>
    <div className="settings-panel-title"><span>{icon}</span><div><h2 id={`${id}-title`}>{title}</h2><p>{subtitle}</p></div></div>{children}
  </section>;
}

function SettingsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("Europe/Oslo");
  const [platforms, setPlatforms] = useState<PlatformStatus[]>([]);
  const [brains, setBrains] = useState<Brain[]>([]);
  const [brainId, setBrainId] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [active, setActive] = useState(() => {
    const requested = searchParams.get("tab");
    return sections.some(s => s.key === requested) ? requested! : "workspace";
  });
  const [motionEnabled, setMotionEnabled] = useState(true);
  const [newBrainName, setNewBrainName] = useState("");
  const [creatingBrain, setCreatingBrain] = useState(false);
  const [editingBrainName, setEditingBrainName] = useState<string | null>(null);
  const [confirmingDeleteBrain, setConfirmingDeleteBrain] = useState(false);
  const [managingPlatform, setManagingPlatform] = useState<Platform | null>(null);
  const isPopupCallback = searchParams.get("popup") === "1";

  /** Re-fetch just the connected-platform list, scoped to one brain (project). */
  const loadAccounts = useCallback(async (targetBrainId: string) => {
    const res = await fetch(`/api/accounts?brainId=${encodeURIComponent(targetBrainId)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not load connected platforms.");
    setPlatforms(data.platformStatus || []);
    if (data.brain?.id) setBrainId(data.brain.id);
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setLoadError("");
    try {
      const responses = await Promise.all([fetch("/api/settings/profile"), fetch("/api/brains")]);
      const [profileData, brainsData] = await Promise.all(responses.map(r => r.json()));
      if (!responses[0].ok || !responses[1].ok) throw new Error(profileData.error || brainsData.error || "Could not load settings.");
      setProfile(profileData.profile); setName(profileData.profile.name || ""); setTimezone(profileData.profile.timezone);
      const loadedBrains: Brain[] = brainsData.brains || [];
      setBrains(loadedBrains);
      const requested = searchParams.get("brain");
      const resolved = (requested && loadedBrains.some(b => b.id === requested)) ? requested : (loadedBrains.find(b => b.isDefault)?.id || loadedBrains[0]?.id || "");
      if (resolved) await loadAccounts(resolved);
    } catch (error) { setLoadError(error instanceof Error ? error.message : "Could not load settings."); }
    finally { setLoading(false); }
  }, [loadAccounts, searchParams]);
  useEffect(() => { if (!isPopupCallback) void load(); }, [load, isPopupCallback]);
  useEffect(() => {
    const enabled = window.localStorage.getItem("socialorc-motion") !== "off";
    setMotionEnabled(enabled);
    document.documentElement.classList.toggle("motion-paused", !enabled);
  }, []);
  useEffect(() => {
    if (isPopupCallback) return;
    const error = searchParams.get("error"), success = searchParams.get("success");
    if (error) { setMessage({ text: error, error: true }); setActive("integrations"); }
    else if (success) { setMessage({ text: `Connected ${success.replace("_connected", "")}.` }); setActive("integrations"); }
  }, [searchParams, isPopupCallback]);
  useEffect(() => {
    // Sidebar links (e.g. every "Connect <platform>" entry) point straight at
    // a tab via ?tab=; this covers the case where Settings is already the
    // mounted page and only the query string changes, so React doesn't
    // remount the component and re-run the initial useState value above.
    if (isPopupCallback) return;
    const requestedTab = searchParams.get("tab");
    if (requestedTab && sections.some(s => s.key === requestedTab)) setActive(requestedTab);
  }, [searchParams, isPopupCallback]);
  /**
   * This window is the popup opened by connect() for the OAuth/token
   * handshake — the redirect it just landed on is the *end* of that flow, not
   * a page for a person to look at. Hand the result to the opener via
   * localStorage (window.opener is often cross-origin by the time a real
   * OAuth provider redirects back, so postMessage isn't reliably available)
   * and close immediately.
   */
  useEffect(() => {
    if (!isPopupCallback) return;
    const success = searchParams.get("success");
    const error = searchParams.get("error");
    window.localStorage.setItem("socialorc-connect-result", JSON.stringify({ success, error }));
    window.close();
  }, [isPopupCallback, searchParams]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setMessage(null);
    try {
      const res = await fetch("/api/settings/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, timezone }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save profile.");
      setProfile(data.profile); setName(data.profile.name); setMessage({ text: "Profile saved. Your updated name will appear in the account menu after your next sign-in." });
    } catch (error) { setMessage({ text: error instanceof Error ? error.message : "Could not save profile.", error: true }); }
    finally { setSaving(false); }
  }
  /**
   * Opens the platform's auth in a popup instead of navigating this tab away
   * — the settings page (brain selection, active tab, an open Manage modal)
   * stays exactly as the user left it, and reconnecting the same platform
   * doesn't need a full page reload either.
   *
   * The popup is opened synchronously, before the network round-trip to
   * fetch the actual authorization URL, so browser popup blockers see it as
   * a direct result of the click.
   */
  async function connect(platform: Platform) {
    setBusy(platform); setMessage(null);
    const popup = window.open("about:blank", "socialorc-connect", "width=520,height=680");
    try {
      const res = await fetch(`/api/social/connect?platform=${platform}&brainId=${encodeURIComponent(brainId)}&popup=${popup ? "1" : "0"}`);
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.message || data.error || "Could not start connection.");

      if (!popup) {
        // Popup blocked: fall back to the old full-page redirect.
        window.location.assign(data.url);
        return;
      }
      popup.location.href = data.url;

      await new Promise<void>((resolve) => {
        const timer = setInterval(() => {
          if (popup.closed) { clearInterval(timer); resolve(); }
        }, 500);
      });

      const raw = window.localStorage.getItem("socialorc-connect-result");
      window.localStorage.removeItem("socialorc-connect-result");
      if (raw) {
        const result = JSON.parse(raw) as { success?: string; error?: string };
        if (result.error) setMessage({ text: result.error, error: true });
        else if (result.success) setMessage({ text: `Connected ${result.success.replace("_connected", "").replace("_mock", "")}.` });
      }
      await loadAccounts(brainId);
    } catch (error) {
      popup?.close();
      setMessage({ text: error instanceof Error ? error.message : "Could not connect.", error: true });
    } finally { setBusy(null); }
  }
  async function switchBrain(id: string) {
    if (!id || id === brainId) return;
    setBusy("brain-switch"); setMessage(null);
    try {
      await loadAccounts(id);
      router.replace(`/settings/accounts?brain=${id}`, { scroll: false });
    } catch (error) { setMessage({ text: error instanceof Error ? error.message : "Could not switch brain.", error: true }); }
    finally { setBusy(null); }
  }
  async function createBrain(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const brainName = newBrainName.trim();
    if (!brainName) return;
    setBusy("brain-create"); setMessage(null);
    try {
      const res = await fetch("/api/brains", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: brainName }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create this brain.");
      setBrains(current => [...current, data.brain]);
      await loadAccounts(data.brain.id);
      router.replace(`/settings/accounts?brain=${data.brain.id}`, { scroll: false });
      setMessage({ text: `Created "${data.brain.name}" — connect its platforms below.` });
      setNewBrainName(""); setCreatingBrain(false);
    } catch (error) { setMessage({ text: error instanceof Error ? error.message : "Could not create this brain.", error: true }); }
    finally { setBusy(null); }
  }
  async function renameBrain(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = editingBrainName?.trim();
    if (!name) return;
    setBusy("brain-rename"); setMessage(null);
    try {
      const res = await fetch(`/api/brains/${brainId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not rename this brain.");
      setBrains(current => current.map(b => b.id === brainId ? { ...b, name: data.brain.name } : b));
      setEditingBrainName(null);
      setMessage({ text: `Renamed to "${data.brain.name}".` });
    } catch (error) { setMessage({ text: error instanceof Error ? error.message : "Could not rename this brain.", error: true }); }
    finally { setBusy(null); }
  }
  async function deleteBrain() {
    setBusy("brain-delete"); setMessage(null);
    try {
      const res = await fetch(`/api/brains/${brainId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not delete this brain.");
      setConfirmingDeleteBrain(false);
      // A fallback brain may just have been created (if that was the last one) — reload the full list.
      const brainsRes = await fetch("/api/brains");
      const brainsData = await brainsRes.json();
      const loadedBrains: Brain[] = brainsData.brains || [];
      setBrains(loadedBrains);
      const nextId = loadedBrains.find(b => b.id !== brainId)?.id || data.fallbackBrainId || loadedBrains[0]?.id;
      if (nextId) { await loadAccounts(nextId); router.replace(`/settings/accounts?brain=${nextId}`, { scroll: false }); }
      setMessage({ text: "Brain deleted." });
    } catch (error) { setMessage({ text: error instanceof Error ? error.message : "Could not delete this brain.", error: true }); }
    finally { setBusy(null); }
  }
  async function disconnect(id: string) {
    setBusy(id); setMessage(null);
    try {
      const res = await fetch(`/api/accounts?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Could not disconnect this account. Please try again.");
      setPlatforms(current => current.map(p => { const accounts = p.accounts.filter(a => a.id !== id); return { ...p, accounts, connected: accounts.some(a => a.isActive) }; }));
      setMessage({ text: "Account disconnected." });
      setManagingPlatform(null);
    } catch (error) { setMessage({ text: error instanceof Error ? error.message : "Could not disconnect.", error: true }); }
    finally { setBusy(null); }
  }
  const connected = platforms.filter(p => p.connected).length;
  const role = isRole(profile?.role) ? profile.role : parseRole(profile?.role);
  const roleMeta = ROLE_META[role];
  const grantedPermissions = permissionsFor(role);
  const dirty = profile && (name.trim() !== (profile.name || "") || timezone !== profile.timezone);
  const zones = Array.from(new Set([timezone, "Europe/Oslo", "Europe/London", "Europe/Paris", "America/New_York", "America/Chicago", "America/Los_Angeles", "Asia/Dubai", "Asia/Kolkata", "Asia/Singapore", "Asia/Tokyo", "Australia/Sydney", "UTC"]));
  function toggleMotion() {
    const enabled = !motionEnabled;
    setMotionEnabled(enabled);
    window.localStorage.setItem("socialorc-motion", enabled ? "on" : "off");
    document.documentElement.classList.toggle("motion-paused", !enabled);
  }

  if (isPopupCallback) {
    const ok = !searchParams.get("error");
    return <div className="settings-popup-done">
      {ok ? <Check size={28} /> : <X size={28} />}
      <p>{ok ? "Connected." : "Something went wrong."}</p>
      <small>This window will close automatically.</small>
    </div>;
  }

  return <div>
    <Header title="Settings & Control" description="Your workspace, your rules." />
    <div className="studio-page settings-page">
      <div className="studio-banner settings-banner"><div><span className="eyebrow">SYSTEM / WORKSPACE</span><h1>Settings & Control</h1><p>Manage your profile, connected platforms, and publishing workflow.</p></div><span className="settings-banner-motto">CONTROL.<br />SECURITY.<br />AUTOMATION.<strong>ALL IN ONE PLACE.</strong></span></div>
      <nav className="settings-nav" role="tablist" aria-label="Settings sections">{sections.map(({ key, label, icon: Icon }) => <button key={key} type="button" role="tab" aria-selected={active === key} aria-current={active === key ? "true" : undefined} onClick={() => setActive(key)}><Icon size={15} />{label}</button>)}</nav>
      {message && <div role={message.error ? "alert" : "status"} className={message.error ? "studio-error" : "studio-notice"}>{message.text}</div>}
      {loadError && <div role="alert" className="studio-error">{loadError}<button onClick={load}>Try again</button></div>}
      {loading ? <div className="settings-loading" role="status"><Loader2 className="animate-spin" />Loading your workspace…</div> : !loadError && <>
      <div className="settings-single">
        {active === "workspace" && <Panel id="workspace" title="Workspace Profile" subtitle="Your personal details and scheduling time zone." icon={<Settings2 size={18} />}>
          <form onSubmit={saveProfile} className="settings-profile-form">
            <div className="settings-profile-fields">
              <label>Display name<input value={name} onChange={e => setName(e.target.value)} required maxLength={80} autoComplete="name" /></label>
              <label>Email address<input value={profile?.email || ""} readOnly autoComplete="email" /></label>
              <label>Time zone<select value={timezone} onChange={e => setTimezone(e.target.value)}>{zones.map(zone => <option key={zone}>{zone}</option>)}</select></label>
              <p className="settings-note">These settings belong to your signed-in account.</p>
            </div>
            <div className="settings-identity"><div className="settings-logo"><OrcMark className="h-16 w-16" /><span>Social<span>Orc</span></span><small>DOMINATE SOCIAL</small></div><button className="settings-save" disabled={saving || !dirty || !name.trim()} type="submit">{saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}{saving ? "Saving…" : "Save Changes"}</button></div>
          </form>
          <div className="settings-preference"><div><SlidersHorizontal size={14} /><span><strong>Interface effects</strong><small>Motion, glow, and progress animations</small></span></div><button type="button" role="switch" aria-checked={motionEnabled} onClick={toggleMotion} className="settings-switch"><span /></button></div>
        </Panel>}
        {active === "brand" && <Panel id="brand" title="Brand Kit" subtitle="The visual identity of your command center." icon={<Palette size={18} />}>
          <div className="settings-brand-fields"><div><span>Primary color</span><p><i style={{ background: "#48ed85" }} />#48ED85</p></div><div><span>Accent color</span><p><i style={{ background: "#a855f7" }} />#A855F7</p></div><div><span>Typography</span><p>Geist Sans</p></div><div><span>Button style</span><p>Rounded</p></div></div>
          <div className="settings-brand-preview"><OrcMark className="h-9 w-9" /><strong>Social<span>Orc</span></strong><small>CREATE. AMPLIFY. DOMINATE.</small></div><p className="settings-note">Current app theme · brand customization is not available yet.</p>
        </Panel>}
        {active === "integrations" && <Panel id="integrations" title="Connected Platforms" subtitle="Connect and manage your social accounts." icon={<Link2 size={18} />}>
          <div className="settings-brain-switcher">
            <label>Brain (project)
              <select value={brainId} disabled={busy !== null} onChange={e => switchBrain(e.target.value)}>
                {brains.map(b => <option key={b.id} value={b.id}>{b.name} ({b.connectedAccounts})</option>)}
              </select>
            </label>
            <button type="button" aria-label="Rename this brain" disabled={busy !== null || !brainId} onClick={() => { setConfirmingDeleteBrain(false); setEditingBrainName(brains.find(b => b.id === brainId)?.name || ""); }}><Pencil size={13} /></button>
            <button type="button" aria-label="Delete this brain" disabled={busy !== null || !brainId || brains.length <= 1} title={brains.length <= 1 ? "You need at least one brain" : undefined} onClick={() => { setEditingBrainName(null); setConfirmingDeleteBrain(true); }}><Trash2 size={13} /></button>
            {!creatingBrain && <button type="button" disabled={busy !== null} onClick={() => setCreatingBrain(true)}>+ New brain</button>}
          </div>
          {editingBrainName !== null && <form onSubmit={renameBrain} className="settings-brain-create">
            <input autoFocus value={editingBrainName} onChange={e => setEditingBrainName(e.target.value)} placeholder="Brain name" maxLength={80} />
            <button type="submit" disabled={busy !== null || !editingBrainName.trim()}>{busy === "brain-rename" ? "Saving…" : "Save"}</button>
            <button type="button" disabled={busy !== null} onClick={() => setEditingBrainName(null)}>Cancel</button>
          </form>}
          {confirmingDeleteBrain && <div className="settings-brain-delete-confirm">
            <p>Delete &quot;{brains.find(b => b.id === brainId)?.name}&quot;? Its {brains.find(b => b.id === brainId)?.connectedAccounts ?? 0} connected platform{brains.find(b => b.id === brainId)?.connectedAccounts === 1 ? "" : "s"} will disconnect too.</p>
            <div>
              <button type="button" disabled={busy !== null} onClick={deleteBrain}>{busy === "brain-delete" ? "Deleting…" : "Yes, delete"}</button>
              <button type="button" disabled={busy !== null} onClick={() => setConfirmingDeleteBrain(false)}>Cancel</button>
            </div>
          </div>}
          {creatingBrain && <form onSubmit={createBrain} className="settings-brain-create">
            <input autoFocus value={newBrainName} onChange={e => setNewBrainName(e.target.value)} placeholder="Brand or client name" maxLength={80} />
            <button type="submit" disabled={busy !== null || !newBrainName.trim()}>{busy === "brain-create" ? "Creating…" : "Create"}</button>
            <button type="button" disabled={busy !== null} onClick={() => { setCreatingBrain(false); setNewBrainName(""); }}>Cancel</button>
          </form>}
          <p className="settings-note">Each brain keeps its own set of connected platforms — switch to see or connect a different project's accounts.</p>
          <div className="settings-usage"><strong>{connected}<span> / {platforms.length}</span></strong><small>platforms connected</small></div>
          <div className="settings-usage-bar"><span style={{ width: `${platforms.length ? connected / platforms.length * 100 : 0}%` }} /></div>
          <div className="settings-platform-grid">{platforms.map(p => {
            const Icon = platformIcons[p.platform], config = PLATFORM_CONFIGS[p.platform];
            const account = p.accounts.find(a => a.isActive);
            return <div key={p.platform} className="settings-platform-card">
              <span className="settings-platform-icon" style={{ color: config.color }}><Icon className="h-6 w-6" /></span>
              <div className="settings-platform-card-body">
                <strong>{config.name}</strong>
                <small title={p.connected ? undefined : !p.configured ? `Set ${p.missingCredentials.join(", ")} in this deployment's environment variables.` : config.notes?.[0]}>
                  {p.connected ? (account?.platformUsername ? `@${account.platformUsername}` : account?.displayName || "Connected")
                    : !p.configured ? `Needs ${p.missingCredentials.join(", ")}`
                    : config.notes?.[0]}
                </small>
              </div>
              {p.connected
                ? <button type="button" onClick={() => setManagingPlatform(p.platform)}>Manage</button>
                : <button type="button" disabled={!p.configured || busy !== null} onClick={() => connect(p.platform)}>{busy === p.platform ? "Connecting…" : "Connect"}</button>}
            </div>;
          })}</div>
        </Panel>}
        {active === "team" && <Panel id="access" title="Team & Access" subtitle="The account currently in this workspace." icon={<UsersRound size={18} />}>
          <div className="settings-member"><span className="settings-avatar">{(profile?.name || "U").slice(0, 1).toUpperCase()}</span><div><strong>{profile?.name || "Your account"}</strong><small>{profile?.email}</small></div><span className="settings-role">{profile?.role}</span></div>
          <p className="settings-note">Team invitations and shared workspace management are not available yet.</p><Link className="settings-panel-link" href="/dashboard">Open Command Center<ArrowUpRight size={13} /></Link>
        </Panel>}
        {active === "permissions" && <Panel id="permissions" title="Permissions" subtitle="What your role can do in this workspace." icon={<LockKeyhole size={18} />}>
          <div className="settings-member"><span className="settings-avatar">{(profile?.name || "U").slice(0, 1).toUpperCase()}</span><div><strong>{roleMeta.label}</strong><small>{roleMeta.blurb}</small></div></div>
          <ul className="settings-permission-list">{grantedPermissions.map(permission => <li key={permission}><Check size={13} />{PERMISSION_LABELS[permission]}</li>)}</ul>
          <p className="settings-note">Per-member roles require team invitations, which are not available yet — every account on this workspace currently shares the {roleMeta.label} role.</p>
          <div className="settings-rule"><Check size={14} /><div><strong>Review before publishing</strong><p>Posts awaiting an approve/schedule decision.</p></div><Link href="/dashboard/approvals">Review<ArrowUpRight size={12} /></Link></div>
          <div className="settings-mini-workflow"><span>Draft</span><span>Review</span><span>Approve</span><span>Publish</span></div>
        </Panel>}
        {active === "notifications" && <Panel id="notifications" title="Notifications" subtitle="Email and in-app alerts." icon={<Bell size={18} />}>
          <div className="settings-rule"><Globe2 size={14} /><div><strong>Platform connections</strong><p>Link accounts for each publishing channel.</p></div><span>{connected} linked</span></div>
          <p className="settings-note">Notification preferences (approval requests, publish failures, weekly summaries) are not available yet — nothing is emailed or pushed on your behalf today.</p>
        </Panel>}
        {active === "billing" && <Panel id="billing" title="Billing" subtitle="Plan, usage and payment method." icon={<CreditCard size={18} />}>
          <p className="settings-note">SocialOrc does not have a paid plan yet — there is nothing to bill, and no payment method is stored.</p>
        </Panel>}
        {active === "security" && <Panel id="security" title="Security" subtitle="Account access and data ownership." icon={<ShieldCheck size={18} />}>
          <div className="settings-security-row"><LockKeyhole size={14} /><span>Account session</span><strong>Signed in</strong></div>
          <div className="settings-security-row"><UserRound size={14} /><span>Social connections</span><strong>Account-owned</strong></div>
          <p className="settings-note">Two-factor authentication, SSO, and session controls are not available in this settings page.</p>
        </Panel>}
      </div>
      {managingPlatform && (() => {
        const p = platforms.find(x => x.platform === managingPlatform);
        if (!p) return null;
        const Icon = platformIcons[p.platform], config = PLATFORM_CONFIGS[p.platform];
        const account = p.accounts.find(a => a.isActive);
        return <div className="settings-modal-backdrop" onClick={() => setManagingPlatform(null)}>
          <div className="settings-modal" onClick={e => e.stopPropagation()}>
            <div className="settings-modal-header">
              <span><Icon className="h-5 w-5" style={{ color: config.color }} />{config.name}</span>
              <button type="button" aria-label="Close" onClick={() => setManagingPlatform(null)}><X size={16} /></button>
            </div>
            <p className="settings-modal-label">Account</p>
            {account && <div className="settings-modal-account"><Icon className="h-5 w-5" style={{ color: config.color }} />{account.displayName || account.platformUsername || "Linked account"}</div>}
            <button type="button" className="settings-modal-action" disabled={busy !== null} onClick={() => connect(p.platform)}>
              <RefreshCw size={13} />{busy === p.platform ? "Reconnecting…" : "Re-connect integration"}
            </button>
            {account && <button type="button" className="settings-modal-action danger" disabled={busy !== null} onClick={() => disconnect(account.id)}>
              <Unlink size={13} />{busy === account.id ? "Disconnecting…" : "Disconnect"}
            </button>}
            <button type="button" className="settings-modal-done" onClick={() => setManagingPlatform(null)}>Done</button>
          </div>
        </div>;
      })()}
      <div className="studio-footer"><ShieldCheck size={14} />Your command center. Ready for what comes next.<Link href="/dashboard/create">Forge your next post<ArrowUpRight size={13} /></Link></div>
      </>}
    </div>
  </div>;
}
export default function AccountsPage() { return <Suspense fallback={<div className="settings-loading">Loading settings…</div>}><SettingsContent /></Suspense>; }
