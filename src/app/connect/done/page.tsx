"use client";

/**
 * Landing page for a connect flow that ran in a popup.
 *
 * The OAuth callback and the Telegram step both finish here: this page tells the
 * window that opened it whether it worked, then closes itself. Opened directly
 * (no opener) it simply forwards to Settings.
 */
import { useEffect, useState } from "react";

export default function ConnectDonePage() {
  const [message, setMessage] = useState("Finishing the connection…");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");
    const success = params.get("success");
    const payload = {
      type: "socialork:connect",
      ok: !error && Boolean(success),
      error: error ?? null,
      account: params.get("account"),
      platform: success ? success.replace(/_connected$/, "") : null,
    };

    if (window.opener && !window.opener.closed) {
      try {
        window.opener.postMessage(payload, window.location.origin);
      } catch {
        /* the opener may be cross-origin after a redirect; closing is enough */
      }
      setMessage(payload.ok ? "Connected. Closing…" : `Not connected: ${error ?? "unknown"}`);
      setTimeout(() => window.close(), payload.ok ? 400 : 1800);
      return;
    }

    window.location.replace(
      `/socialork/settings?${payload.ok ? "connected=1" : `error=${encodeURIComponent(error ?? "unknown")}`}`,
    );
  }, []);

  return (
    <main
      style={{
        minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24,
        background: "#0b0b0e", color: "#ededf1",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", fontSize: 14,
      }}
    >
      <div style={{ display: "grid", gap: 8, textAlign: "center", maxWidth: 360 }}>
        <strong style={{ fontSize: 16 }}>{message}</strong>
        <span style={{ color: "#94a1b2", fontSize: 12.5 }}>
          You can close this tab if it stays open — the other window updates by itself.
        </span>
      </div>
    </main>
  );
}
