"use client";

/**
 * Telegram has no OAuth: the customer brings their own bot. This is the step the
 * old settings screen owned (and which the redesign had left unreachable): fetch
 * a connect state, then hand the bot token + chat to the server, which validates
 * both against Telegram before anything is stored.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

export function TelegramConnectForm({ onDone }: { onDone?: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [botToken, setBotToken] = useState("");
  const [chat, setChat] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const field: React.CSSProperties = {
    width: "100%", height: 32, padding: "0 10px", borderRadius: 8, border: "1px solid var(--line2)",
    background: "var(--panel2)", color: "var(--text)", fontSize: 12.5, outline: "none",
  };

  const connect = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setNote(null);
    try {
      // The state is minted by the same endpoint every connector uses; Telegram
      // then proves possession of the bot token instead of an OAuth code.
      const start = await fetch("/api/social/connect?platform=TELEGRAM");
      const startData = (await start.json().catch(() => ({}))) as { state?: string; error?: string };
      if (!start.ok || !startData.state) {
        setNote({ kind: "err", text: startData.error ?? "Could not start the Telegram connect flow." });
        return;
      }

      const res = await fetch("/api/social/telegram/connect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state: startData.state, botToken: botToken.trim(), chat: chat.trim() || undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok) {
        setNote({ kind: "err", text: data.error ?? `Telegram rejected that (${res.status}).` });
        return;
      }
      setNote({ kind: "ok", text: data.message ?? "Telegram connected." });
      setBotToken("");
      setChat("");
      setOpen(false);
      onDone?.();
      router.refresh();
      setTimeout(() => window.location.reload(), 300);
    } catch {
      setNote({ kind: "err", text: "Network error — nothing was connected." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
      <button className="so-btn" style={{ height: 26 }} onClick={() => setOpen((v) => !v)}>
        {open ? "Cancel" : "Connect"}
      </button>

      {open ? (
        <form onSubmit={connect} className="so-card so-card-pad"
          style={{ display: "grid", gap: 8, width: 320, textAlign: "left", marginTop: 4 }}>
          <div style={{ display: "grid", gap: 4 }}>
            <label className="so-stat-label" htmlFor="tg-token">Bot token</label>
            <input id="tg-token" value={botToken} onChange={(e) => setBotToken(e.target.value)}
              placeholder="123456789:AA…" style={field} autoComplete="off" required />
          </div>
          <div style={{ display: "grid", gap: 4 }}>
            <label className="so-stat-label" htmlFor="tg-chat">Chat (channel @name or id)</label>
            <input id="tg-chat" value={chat} onChange={(e) => setChat(e.target.value)}
              placeholder="@my_channel" style={field} />
          </div>
          <span style={{ fontSize: 10.5, color: "var(--text3)" }}>
            From @BotFather. Add the bot as an admin of the channel before connecting.
          </span>
          <button className="so-btn" data-variant="primary" type="submit" disabled={busy || !botToken.trim()}>
            {busy ? "Checking with Telegram…" : "Connect bot"}
          </button>
        </form>
      ) : null}

      {note ? (
        <span style={{ fontSize: 11, color: note.kind === "ok" ? "var(--green)" : "var(--red)", maxWidth: 260 }}>
          {note.text}
        </span>
      ) : null}
    </span>
  );
}
