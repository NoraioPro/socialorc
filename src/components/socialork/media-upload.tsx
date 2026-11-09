"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

/** Uploads through the existing POST /api/media route, one file at a time, then refreshes the library. */
export function MediaUpload() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setBusy(true);
    setError(null);
    for (const file of files) {
      const body = new FormData();
      body.append("file", file);
      try {
        const res = await fetch("/api/media", { method: "POST", body });
        if (!res.ok) {
          const j = (await res.json().catch(() => null)) as { error?: string } | null;
          setError(`${file.name}: ${j?.error ?? "Upload failed"}`);
          break;
        }
      } catch {
        setError(`${file.name}: Upload failed`);
        break;
      }
    }
    if (input.current) input.current.value = "";
    setBusy(false);
    router.refresh();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
      <button type="button" className="so-btn" data-variant="primary" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? "Uploading..." : "+ Upload"}
      </button>
      <input ref={input} type="file" accept="image/*,video/mp4" multiple hidden onChange={onChange} aria-label="Upload images or MP4 videos" />
      {error ? <span role="alert" style={{ fontSize: 11.5, color: "var(--red)" }}>{error}</span> : null}
    </div>
  );
}
