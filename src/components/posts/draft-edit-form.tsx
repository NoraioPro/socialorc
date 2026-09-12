"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Platform, PostStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { PlatformCharCounts } from "@/components/posts/platform-char-counts";
import { Loader2 } from "lucide-react";

export function DraftEditForm({
  postId,
  initialContent,
  platform,
  hasMedia,
  status,
}: {
  postId: string;
  initialContent: string;
  platform: Platform;
  hasMedia: boolean;
  status: PostStatus;
}) {
  const router = useRouter();
  const [content, setContent] = useState(initialContent);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to save");
      router.refresh();
      router.push("/dashboard/drafts");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-2">
        <Badge variant="outline">{platform === "TWITTER" ? "X" : platform}</Badge>
        <Badge variant="secondary">{status.replace("_", " ")}</Badge>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <div className="space-y-2">
        <Label htmlFor="draft-content">Content</Label>
        <Textarea
          id="draft-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={10}
        />
        <PlatformCharCounts
          text={content}
          platforms={[platform]}
          hasMedia={hasMedia}
          title="Remaining for this platform"
        />
        <PlatformCharCounts
          text={content}
          platforms={Object.values(Platform)}
          hasMedia={hasMedia}
          title="Remaining across platforms"
        />
      </div>

      <div className="flex gap-2">
        <Button onClick={onSave} disabled={saving || !content.trim()}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save
        </Button>
        <Button variant="outline" onClick={() => router.push("/dashboard/drafts")}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
