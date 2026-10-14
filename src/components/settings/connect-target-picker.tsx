"use client";

import { useEffect, useState } from "react";
import { Platform } from "@prisma/client";
import { Check, Loader2, X } from "lucide-react";
import { platformIcons } from "@/components/icons/platform-icons";
import { PLATFORM_CONFIGS, type ConnectTarget } from "@/types/platform";

/**
 * "Which Page / Instagram account?" — shown after a Facebook or Instagram
 * login that covers more than one. The candidates come from
 * `GET /api/social/pending`, which re-reads them from Meta with the parked
 * grant; nothing about the grant itself ever reaches the browser.
 */
export function ConnectTargetPicker({
  platform,
  onConnected,
  onClose,
}: {
  platform: Platform;
  onConnected: (message: string) => void;
  onClose: (error?: string) => void;
}) {
  const [targets, setTargets] = useState<ConnectTarget[] | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState<string | null>(null);
  const config = PLATFORM_CONFIGS[platform];
  const Icon = platformIcons[platform];
  const noun = platform === Platform.INSTAGRAM ? "Instagram account" : "Facebook Page";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/social/pending?platform=${platform}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Could not load your ${noun}s.`);
        if (!cancelled) setTargets(data.targets || []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : `Could not load your ${noun}s.`);
      }
    })();
    return () => { cancelled = true; };
  }, [platform, noun]);

  async function choose(target: ConnectTarget) {
    setSubmitting(target.id); setError("");
    try {
      const res = await fetch("/api/social/pending", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, targetId: target.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not connect that account.");
      onConnected(`Connected ${config.name}: ${target.name}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect that account.");
      setSubmitting(null);
    }
  }

  async function cancel() {
    // Drop the parked grant so it cannot be picked up later by accident.
    await fetch(`/api/social/pending?platform=${platform}`, { method: "DELETE" }).catch(() => undefined);
    onClose();
  }

  return <div className="settings-modal-backdrop" onClick={cancel}>
    <div className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="connect-target-title" onClick={e => e.stopPropagation()}>
      <div className="settings-modal-header">
        <span id="connect-target-title"><Icon className="h-5 w-5" style={{ color: config.color }} />Choose a {noun}</span>
        <button type="button" aria-label="Cancel" onClick={cancel}><X size={16} /></button>
      </div>
      <p className="settings-modal-label">You manage more than one. Pick the {noun} to publish to — connect again to add another.</p>
      {error && <p className="settings-modal-warning" role="alert"><span>{error}</span></p>}
      {!targets && !error && <div className="settings-target-loading" role="status"><Loader2 size={14} className="animate-spin" />Loading…</div>}
      {targets && <ul className="settings-target-list">
        {targets.map(target => <li key={target.id}>
          <button type="button" className="settings-modal-action" disabled={submitting !== null} onClick={() => choose(target)}>
            {target.pictureUrl
              // eslint-disable-next-line @next/next/no-img-element -- remote Meta CDN avatar, no loader configured
              ? <img src={target.pictureUrl} alt="" width={24} height={24} className="settings-target-avatar" />
              : <Icon className="h-5 w-5" style={{ color: config.color }} />}
            <span className="settings-target-text">
              <strong>{target.name}</strong>
              {(target.username || target.detail) && <small>{target.username ? `@${target.username}` : ""}{target.username && target.detail ? " · " : ""}{target.detail ?? ""}</small>}
            </span>
            {submitting === target.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} className="settings-target-check" />}
          </button>
        </li>)}
      </ul>}
      <button type="button" className="settings-modal-done" onClick={cancel}>Cancel</button>
    </div>
  </div>;
}
