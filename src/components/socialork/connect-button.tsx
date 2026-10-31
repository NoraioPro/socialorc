"use client";

/**
 * Starts a connect flow in a NEW TAB and refreshes this screen when it finishes.
 *
 * The provider's consent screen is a separate document; navigating away from the
 * app mid-setup loses the user's place. The popup reports back via
 * /connect/done → postMessage, and a blocked popup falls back to the same tab so
 * the flow can never dead-end.
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function ConnectButton({
  platform,
  label = "Connect",
  mode = "oauth",
}: {
  platform: string;
  label?: string;
  mode?: "oauth" | "same-tab";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const popupRef = useRef<Window | null>(null);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: string; ok?: boolean; error?: string | null } | null;
      if (!data || data.type !== "socialork:connect") return;
      setBusy(false);
      if (data.ok) {
        setError(null);
        router.refresh();
        setTimeout(() => window.location.reload(), 150);
      } else {
        setError(data.error ? `Not connected: ${data.error}` : "Not connected.");
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [router]);

  // If the user closes the popup without finishing, stop the spinner.
  useEffect(() => {
    if (!busy || !popupRef.current) return;
    const timer = setInterval(() => {
      if (popupRef.current?.closed) {
        setBusy(false);
        clearInterval(timer);
      }
    }, 1200);
    return () => clearInterval(timer);
  }, [busy]);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/social/connect?platform=${platform}`);
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error ?? `Not configured (${res.status})`);
        setBusy(false);
        return;
      }
      if (mode === "same-tab") {
        window.location.href = data.url;
        return;
      }
      const popup = window.open(data.url, `socialork-connect-${platform}`, "width=620,height=760");
      if (!popup) {
        // Popup blocked: keep the user moving rather than failing silently.
        window.location.href = data.url;
        return;
      }
      popupRef.current = popup;
      popup.focus();
    } catch {
      setError("Network error");
      setBusy(false);
    }
  };

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <button className="so-btn" style={{ height: 26 }} onClick={start} disabled={busy}>
        {busy ? "Waiting for approval…" : label}
      </button>
      {error ? <span style={{ fontSize: 11, color: "var(--red)", maxWidth: 220 }}>{error}</span> : null}
    </span>
  );
}
