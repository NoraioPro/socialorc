"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, FileText, Globe, Loader2, Plus, Trash2 } from "lucide-react";

interface KnowledgeSource {
  id: string;
  type: string;
  title: string;
  sourceUrl: string | null;
  status: string;
  errorMessage: string | null;
  index: string | null;
  embeddingModel: string | null;
  embeddingError: string | null;
  chunkCount: number;
  characters: number;
  createdAt: string;
}

interface SourcesResponse {
  sources: KnowledgeSource[];
  canManage: boolean;
  indexing: { mode: "semantic" | "lexical"; model: string | null };
}

const MAX_CHARS = 100_000;

function indexLabel(source: KnowledgeSource): { text: string; title: string } {
  if (source.status !== "ready") {
    return { text: source.status === "failed" ? "Failed" : "Processing", title: source.errorMessage ?? "" };
  }
  if (source.index === "semantic") {
    return { text: "Semantic", title: `Embedded with ${source.embeddingModel ?? "your AI provider"}` };
  }
  if (source.index === "local-hash") {
    return { text: "Test index", title: "Offline hash embedding (development only) — not semantic search" };
  }
  return {
    text: "Keyword only",
    title: source.embeddingError
      ? `Embedding failed (${source.embeddingError}); found by keyword match (BM25), not semantic search`
      : "Found by keyword match (BM25), not semantic search",
  };
}

/** Brand Brain knowledge sources: what generation draws its facts from. */
export function KnowledgeSources() {
  const [data, setData] = useState<SourcesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState<"text" | "url">("text");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/brand-brain/sources");
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Could not load knowledge sources");
        return;
      }
      setData(body as SourcesResponse);
    } catch {
      setError("Could not load knowledge sources");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const payload =
        kind === "text"
          ? { kind, title, text }
          : { kind, url, ...(title.trim() ? { title } : {}) };
      const res = await fetch("/api/brand-brain/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Could not add the source");
        return;
      }
      const source = body.source as { chunkCount: number; index: string; embeddingError?: string };
      setNotice(
        source.index === "semantic"
          ? `Added and embedded (${source.chunkCount} chunks).`
          : source.embeddingError
            ? `Added for keyword search only (${source.chunkCount} chunks) — embedding failed: ${source.embeddingError}`
            : `Added for keyword search (${source.chunkCount} chunks).`,
      );
      setTitle("");
      setText("");
      setUrl("");
      await load();
    } catch {
      setError("Could not add the source");
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (source: KnowledgeSource) => {
    if (!window.confirm(`Delete "${source.title}"? Generation will stop using it.`)) return;
    setDeleting(source.id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/brand-brain/sources/${source.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Could not delete the source");
        return;
      }
      await load();
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const canManage = data?.canManage ?? false;
  const sources = data?.sources ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Knowledge sources</CardTitle>
          <CardDescription>
            Product facts, guidelines and pages your posts should draw on. When you generate content,
            the most relevant excerpts are added to the prompt.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {data && (
            <p className="text-sm text-muted-foreground" data-testid="knowledge-indexing">
              {data.indexing.mode === "semantic"
                ? `New sources are embedded with ${data.indexing.model} using your AI key, for semantic search.`
                : "No AI key is configured, so new sources are indexed for keyword search (BM25) — not semantic search. Add a key under Settings → AI to embed them."}
            </p>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
          {notice && (
            <div className="rounded-md bg-green-50 p-3 text-sm text-green-700" role="status">
              {notice}
            </div>
          )}

          {canManage ? (
            <form onSubmit={add} className="space-y-3">
              <div className="flex gap-2" role="group" aria-label="Source type">
                <Button
                  type="button"
                  variant={kind === "text" ? "default" : "outline"}
                  size="sm"
                  aria-pressed={kind === "text"}
                  onClick={() => setKind("text")}
                >
                  <FileText className="mr-1 h-4 w-4" /> Paste text
                </Button>
                <Button
                  type="button"
                  variant={kind === "url" ? "default" : "outline"}
                  size="sm"
                  aria-pressed={kind === "url"}
                  onClick={() => setKind("url")}
                >
                  <Globe className="mr-1 h-4 w-4" /> Web page
                </Button>
              </div>

              <div className="space-y-2">
                <Label htmlFor="knowledge-title">
                  Title{kind === "url" ? " (optional — defaults to the page title)" : ""}
                </Label>
                <Input
                  id="knowledge-title"
                  value={title}
                  maxLength={200}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={kind === "text" ? "e.g. Product fact sheet" : "e.g. About us page"}
                />
              </div>

              {kind === "text" ? (
                <div className="space-y-2">
                  <Label htmlFor="knowledge-text">Text</Label>
                  <Textarea
                    id="knowledge-text"
                    className="min-h-[160px]"
                    value={text}
                    maxLength={MAX_CHARS}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Paste product details, guidelines, FAQs…"
                  />
                  <p className="text-xs text-muted-foreground">
                    {text.length.toLocaleString()} / {MAX_CHARS.toLocaleString()} characters
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="knowledge-url">Page URL</Label>
                  <Input
                    id="knowledge-url"
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://example.com/about"
                  />
                  <p className="text-xs text-muted-foreground">
                    Public https pages only (HTML or plain text, up to 2 MB). The page is read once, now.
                  </p>
                </div>
              )}

              <Button
                type="submit"
                disabled={
                  submitting || (kind === "text" ? !title.trim() || !text.trim() : !url.trim())
                }
              >
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                Add source
              </Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              Only admins and managers can add or delete knowledge sources.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sources ({sources.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {sources.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No knowledge yet. Generation uses only the brand profile above until you add a source.
            </p>
          ) : (
            <ul className="divide-y" data-testid="knowledge-list">
              {sources.map((source) => {
                const label = indexLabel(source);
                return (
                  <li key={source.id} className="flex items-start justify-between gap-4 py-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {source.type === "website" ? (
                          <Globe className="h-4 w-4 shrink-0 text-muted-foreground" aria-label="Web page" />
                        ) : (
                          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-label="Text" />
                        )}
                        <span className="truncate font-medium">{source.title}</span>
                        <Badge
                          variant={source.status === "failed" ? "destructive" : source.index === "semantic" ? "default" : "secondary"}
                          title={label.title}
                        >
                          {label.text}
                        </Badge>
                      </div>
                      {source.sourceUrl && (
                        <p className="truncate text-xs text-muted-foreground">{source.sourceUrl}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {source.chunkCount} chunks · {source.characters.toLocaleString()} characters · added{" "}
                        {new Date(source.createdAt).toLocaleDateString()}
                      </p>
                      {source.status === "failed" && source.errorMessage && (
                        <p className="text-xs text-red-700">{source.errorMessage}</p>
                      )}
                      {source.status === "ready" && source.embeddingError && (
                        <p className="text-xs text-amber-700">
                          Embedding failed, so this source is keyword-only: {source.embeddingError}
                        </p>
                      )}
                    </div>
                    {canManage && (
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Delete ${source.title}`}
                        disabled={deleting === source.id}
                        onClick={() => remove(source)}
                      >
                        {deleting === source.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
