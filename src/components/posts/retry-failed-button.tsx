"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { RefreshCw, Loader2 } from "lucide-react";

export function RetryFailedButton({ postId }: { postId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onRetry = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/posts/${postId}/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Retry failed");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Retry failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-1">
      <Button
        size="sm"
        variant="outline"
        className="w-full gap-2"
        onClick={onRetry}
        disabled={loading}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <RefreshCw className="h-4 w-4" />
        )}
        Retry publish
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
