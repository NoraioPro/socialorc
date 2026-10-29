"use client";

import { useState } from "react";
import { Platform } from "@prisma/client";
import { ExternalLink, Loader2, X } from "lucide-react";
import { platformIcons } from "@/components/icons/platform-icons";
import { PLATFORM_CONFIGS } from "@/types/platform";

/**
 * Connect a Telegram chat with your own bot.
 *
 * The customer creates a bot with @BotFather, pastes its token and names the
 * chat it should publish to (POST /api/social/telegram/connect). The server
 * validates the token with Telegram, checks the bot can post in that chat and
 * stores the token encrypted on this account only. `state` is the connect flow
 * started by /api/social/connect, whose signed cookie the call requires.
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
  const [botToken, setBotToken] = useState("");
  const [chat, setChat] = useState("");
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState(false);
  const config = PLATFORM_CONFIGS[Platform.TELEGRAM];
  const Icon = platformIcons[Platform.TELEGRAM];

  async function connect() {
    setConnecting(true); setError("");
    try {
      const res = await fetch("/api/social/telegram/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state, botToken: botToken.trim(), chat: chat.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not connect Telegram.");
      setBotToken("");
      onConnected(`Connected ${config.name}${data.chatTitle ? `: ${data.chatTitle}` : ""}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect Telegram.");
      setConnecting(false);
    }
  }

  return <div className="settings-modal-backdrop" onClick={() => onClose()}>
    <div className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="telegram-connect-title" onClick={e => e.stopPropagation()}>
      <div className="settings-modal-header">
        <span id="telegram-connect-title"><Icon className="h-5 w-5" style={{ color: config.color }} />Connect your Telegram bot</span>
        <button type="button" aria-label="Cancel" onClick={() => onClose()}><X size={16} /></button>
      </div>
      <p className="settings-modal-label">
        Posts are published by your own bot. In Telegram, message{" "}
        <a href="https://t.me/BotFather" target="_blank" rel="noreferrer">@BotFather <ExternalLink size={11} /></a>
        {" "}and send <code>/newbot</code>, then paste the token it gives you.
      </p>
      <label className="settings-modal-label" htmlFor="telegram-bot-token">Bot token</label>
      <input id="telegram-bot-token" type="password" autoComplete="off" spellCheck={false} value={botToken} onChange={e => setBotToken(e.target.value)} placeholder="123456789:AA…" />
      <p className="settings-modal-label">
        Then choose where it posts. For your own chat, open your bot and send <code>/start</code>. For a group, add the bot to it.
        For a channel, add the bot as an admin that can post.
      </p>
      <label className="settings-modal-label" htmlFor="telegram-chat">Chat id or @channel</label>
      <input id="telegram-chat" value={chat} onChange={e => setChat(e.target.value)} placeholder="123456789, -1001234567890 or @mychannel" />
      {error && <p className="settings-modal-warning" role="alert"><span>{error}</span></p>}
      <button type="button" className="settings-modal-done" disabled={connecting || !botToken.trim() || !chat.trim()} onClick={connect}>
        {connecting ? <><Loader2 size={13} className="animate-spin" />Checking…</> : "Connect"}
      </button>
    </div>
  </div>;
}
