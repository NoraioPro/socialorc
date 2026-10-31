"use client";

/**
 * In-product guidance for connecting a channel.
 *
 * The app cannot create a provider app on someone's behalf, so it has to be
 * excellent at explaining what to do instead: who is allowed to do it, what they
 * need, where to click, and the exact redirect URI to paste into the portal.
 */
import { useEffect, useState } from "react";

export type GuidePlatform = {
  platform: string;
  name: string;
  needsApp: boolean;
  redirectUri?: string | null;
  missing?: string[];
  connected: boolean;
};

const STEPS: Record<string, string[]> = {
  TELEGRAM: [
    "Open Telegram and message @BotFather, send /newbot, and copy the token it prints.",
    "Add that bot as an administrator of the channel or group it should post to.",
    "Press Connect here, paste the token, and pick the chat. Done — Telegram needs no review.",
  ],
  LINKEDIN: [
    "An admin creates an app at linkedin.com/developers/apps and requests the “Share on LinkedIn” product (scope w_member_social).",
    "Paste the redirect URI below into the app's Authorized redirect URLs — it must match exactly, including https and no trailing slash.",
    "Put LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET in the deployment, then press Connect and approve as the account that should post.",
  ],
  TWITTER: [
    "An admin creates an app at developer.x.com with OAuth 2.0 (type: Web App) and the scopes tweet.read, tweet.write, users.read, offline.access.",
    "Register the redirect URI below, and note that writing to X needs a paid API tier.",
    "Put TWITTER_CLIENT_ID and TWITTER_CLIENT_SECRET in the deployment, then press Connect.",
  ],
  FACEBOOK: [
    "An admin creates one Meta app (type Business) and adds Facebook Login for Business.",
    "Request App Review for pages_show_list, pages_manage_posts and pages_read_engagement — publishing to pages you don't admin is blocked until then.",
    "Register the redirect URI below, add FACEBOOK_APP_ID and FACEBOOK_APP_SECRET, then press Connect and pick the Page.",
  ],
  INSTAGRAM: [
    "Reuse the same Meta app: add the Instagram Graph API product.",
    "The Instagram account must be Business or Creator and linked to a Facebook Page.",
    "Request instagram_basic and instagram_content_publish, register the redirect URI below, add INSTAGRAM_APP_ID and INSTAGRAM_APP_SECRET, then Connect.",
  ],
  YOUTUBE: [
    "An admin creates a Google Cloud project, enables YouTube Data API v3, and makes an OAuth client of type Web application.",
    "Add the scope youtube.upload and register the redirect URI below.",
    "Add YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET, then Connect. Until the app is verified by Google, uploads land as private.",
  ],
  TIKTOK: [
    "An admin creates an app at developers.tiktok.com and adds the Content Posting API.",
    "Request video.publish (direct) and/or video.upload (draft to inbox), then register the redirect URI below.",
    "Add TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET. Until the audit passes, posts are created as SELF_ONLY — only the author sees them.",
  ],
};

export function ConnectionGuide({ platforms }: { platforms: GuidePlatform[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [origin, setOrigin] = useState<string>("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const insecure = origin.startsWith("http://");

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard blocked — the URI is on screen anyway */
    }
  };

  return (
    <section className="so-card">
      <div className="so-card-pad" style={{ borderBottom: "1px solid var(--line)" }}>
        <div className="so-row">
          <span className="so-stat-label">How connecting works</span>
          <span className="so-mono" style={{ marginLeft: "auto", fontSize: 11, color: "var(--text3)" }}>
            you connect your own · the team uses what you share
          </span>
        </div>
      </div>
      <div className="so-card-pad" style={{ display: "grid", gap: 10 }}>
        {insecure ? (
          <div className="so-banner" style={{ alignItems: "flex-start" }}>
            <div style={{ display: "grid", gap: 2 }}>
              <strong>OAuth needs an https origin — this page is on {origin}</strong>
              <span style={{ color: "var(--text2)" }}>
                LinkedIn, Meta, Google and X reject an http redirect. Telegram works here, but for the
                others use a tunnel (cloudflared / ngrok) or the deployed domain, then register{" "}
                <code className="so-mono">https://&lt;that-host&gt;/api/social/&lt;platform&gt;/callback</code>{" "}
                in each portal — and open the app from that address so the URI below is the right one.
              </span>
            </div>
          </div>
        ) : null}

        <div style={{ display: "grid", gap: 6, fontSize: 12.5, color: "var(--text2)" }}>
          <span>
            <b style={{ color: "var(--text)" }}>Every member</b> can connect their own accounts (LinkedIn, X,
            Instagram, Facebook, YouTube, TikTok, Telegram). A fresh connection is <b>private to you</b>.
          </span>
          <span>
            <b style={{ color: "var(--text)" }}>To let the team publish</b> through it, switch the connection
            to <b>workspace</b>. Only the person who connected it can widen it; an admin can always take
            sharing away.
          </span>
          <span>
            <b style={{ color: "var(--text)" }}>Brand pages and channels</b> should be connected by an admin
            and shared, so nobody has to hand over a personal password.
          </span>
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          {platforms.map((p) => {
            const isOpen = open === p.platform;
            const steps = STEPS[p.platform] ?? [];
            return (
              <div key={p.platform} style={{ border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden" }}>
                <button
                  onClick={() => setOpen(isOpen ? null : p.platform)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 12px",
                    background: isOpen ? "var(--panel2)" : "transparent", border: 0, color: "inherit",
                    cursor: "pointer", textAlign: "left", fontSize: 12.5,
                  }}
                >
                  <span style={{ fontWeight: 600, minWidth: 92 }}>{p.name}</span>
                  {p.connected ? (
                    <span className="so-pill" data-tone="approved">connected</span>
                  ) : p.missing?.length ? (
                    <span className="so-pill" data-tone="review">needs app credentials</span>
                  ) : (
                    <span className="so-pill">ready to connect</span>
                  )}
                  <span className="so-mono" style={{ marginLeft: "auto", fontSize: 10.5, color: "var(--text3)" }}>
                    {isOpen ? "hide steps" : `how to connect · ${steps.length} steps`}
                  </span>
                </button>

                {isOpen ? (
                  <div style={{ padding: "4px 12px 12px", display: "grid", gap: 8 }}>
                    <ol style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6, fontSize: 12.5, color: "var(--text2)" }}>
                      {steps.map((s) => <li key={s}>{s}</li>)}
                    </ol>
                    {p.redirectUri ? (
                      <div style={{ display: "grid", gap: 4 }}>
                        <span className="so-stat-label">Redirect URI to register</span>
                        <div className="so-row" style={{ gap: 8 }}>
                          <code className="so-mono" style={{ fontSize: 11, color: "var(--text2)", wordBreak: "break-all" }}>
                            {p.redirectUri}
                          </code>
                          <button className="so-btn" style={{ height: 24, flex: "none" }}
                            onClick={() => void copy(p.redirectUri!)}>
                            {copied === p.redirectUri ? "Copied" : "Copy"}
                          </button>
                        </div>
                      </div>
                    ) : null}
                    {p.needsApp && p.missing?.length ? (
                      <span className="so-mono" style={{ fontSize: 10.5, color: "var(--amber)" }}>
                        set {p.missing.join(", ")} in the deployment before this can connect
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
