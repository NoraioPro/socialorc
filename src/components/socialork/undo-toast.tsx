"use client";
import { useEffect, useState } from "react";

type Toast = { id: number; text: string; undo?: () => Promise<void> | void };
const EVENT = "so-toast";

/** Show a toast anywhere in the app. With `undo`, it offers an Undo button for 8 seconds. */
export function showToast(text: string, undo?: Toast["undo"]) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { id: Date.now() + Math.random(), text, undo } }));
}

export function ToastHost() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  useEffect(() => {
    const on = (e: Event) => {
      const t = (e as CustomEvent<Toast>).detail;
      setToasts((x) => [...x.slice(-2), t]);
      setTimeout(() => setToasts((x) => x.filter((y) => y.id !== t.id)), 8000);
    };
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  if (!toasts.length) return null;
  return (
    <div role="status" aria-live="polite" data-testid="toasts" style={{ position: "fixed", insetInlineEnd: 16, bottom: 76, zIndex: 80, display: "grid", gap: 8 }}>
      {toasts.map((t) => (
        <div key={t.id} className="so-card" style={{ display: "flex", gap: 12, alignItems: "center", padding: "10px 14px", fontSize: 13, boxShadow: "0 12px 30px rgba(0,0,0,.4)" }}>
          <span>{t.text}</span>
          {t.undo && (
            <button className="so-btn" style={{ height: 28 }} onClick={async () => { setToasts((x) => x.filter((y) => y.id !== t.id)); await t.undo?.(); }}>Undo</button>
          )}
        </div>
      ))}
    </div>
  );
}
