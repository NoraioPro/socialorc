"use client";

import { useEffect, useState } from "react";
import { Platform } from "@prisma/client";
import { Check, Copy, ExternalLink, Loader2, X } from "lucide-react";
import { platformIcons } from "@/components/icons/platform-icons";
import { PLATFORM_CONFIGS } from "@/types/platform";

type Issued = {
  code: string;
  expiresAt: string;
  botUsername: string | null;
  links: { privateChat: string; group: string } | null;
};

/**
 * Connect a Telegram chat by proving you control it.
 *
 * The server issues a one-time code (POST /api/social/telegram/connect/code);
 * the user posts it in the chat the bot should publish to, then verifies
 * (POST /api/social/telegram/connect). Only the chat the bot saw the code in
 * is connected. `state` is the connect flow started by /api/social/connect,
 * whose signed cookie both calls require.
 */
export function TelegramConnectDialog({
  state,
  onConnected,
  onClose,
}: {
  state: string;
  onConnected: (message: string) => void;
  onClose: (error?: string) => void;
}) {
  const [issued, setIssued] = useState<Issued | null>(null);
  const [chatId, setChatId] = useState("");
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [copied, setCopied] = useState(false);
  const config = PLATFORM_CONFIGS[Platform.TELEGRAM];
  const Icon = platformIcons[Platform.TELEGRAM];

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/social/telegram/connect/code", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ state }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not start connecting Telegram.");
        if (!cancelled) {
          setIssued(data);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not start connecting Telegram.");
      }
    })();
    return () => { cancelled = true; };
  }, [state]);

  const command = issued ? (issued.botUsername ? `/connect@${issued.botUsername} ${issued.code}` : issued.code) : "";

  async function copy() {
    try { await navigator.clipboard.writeText(command); setCopied(true); } catch { /* clipboard blocked: the code is on screen */ }
  }

  async function verify() {
    if (!issued) return;
    setVerifying(true); setError("");
    try {
      const res = await fetch("/api/social/telegram/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state, code: issued.code, chatId: chatId.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not connect Telegram.");
      onConnected(`Connected ${config.name}${data.chatTitle ? `: ${data.chatTitle}` : ""}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect Telegram.");
      setVerifying(false);
    }
  }

  return <div className="settings-modal-backdrop" onClick={() => onClose()}>
    <div className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="telegram-connect-title" onClick={e => e.stopPropagation()}>
      <div className="settings-modal-header">
        <span id="telegram-connect-title"><Icon className="h-5 w-5" style={{ color: config.color }} />Connect a Telegram chat</span>
        <button type="button" aria-label="Cancel" onClick={() => onClose()}><X size={16} /></button>
      </div>
      {!issued && !error && <div className="settings-target-loading" role="status"><Loader2 size={14} className="animate-spin" />Preparing a code…</div>}
      {issued && <>
        <p className="settings-modal-label">
          Prove this is your chat: post the message below in the chat {issued.botUsername ? <>where <strong>@{issued.botUsername}</strong></> : "where the bot"} should publish.
          In a group, post it yourself as an admin. In a channel, add the bot as an admin first.
          The code works once and expires at {new Date(issued.expiresAt).toLocaleTimeString()}.
        </p>
        <div className="settings-modal-action" aria-live="polite">
          <code style={{ flex: 1, overflowWrap: "anywhere" }}>{command}</code>
          <button type="button" aria-label="Copy" onClick={copy}>{copied ? <Check size={13} /> : <Copy size={13} />}</button>
        </div>
        {issued.links && <p className="settings-modal-label">
          Or let Telegram send it for you:{" "}
          <a href={issued.links.privateChat} target="_blank" rel="noreferrer">private chat with the bot <ExternalLink size={11} /></a>
          {" · "}
          <a href={issued.links.group} target="_blank" rel="noreferrer">add the bot to a group <ExternalLink size={11} /></a>
        </p>}
        <label className="settings-modal-label" htmlFor="telegram-chat-id">Chat id (optional — only checked against where the code was posted)</label>
        <input id="telegram-chat-id" value={chatId} onChange={e => setChatId(e.target.value)} placeholder="-1001234567890" inputMode="numeric" />
      </>}
      {error && <p className="settings-modal-warning" role="alert"><span>{error}</span></p>}
      <button type="button" className="settings-modal-done" disabled={!issued || verifying} onClick={verify}>
        {verifying ? <><Loader2 size={13} className="animate-spin" />Checking…</> : "I've posted it — connect"}
      </button>
    </div>
  </div>;
}
