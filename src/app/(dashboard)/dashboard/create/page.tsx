"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/dashboard/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Platform } from "@prisma/client";
import { PLATFORM_CONFIGS } from "@/types/platform";
import { Wand2, Loader2, Check } from "lucide-react";
import { platformIcons } from "@/components/icons/platform-icons";
import { LocaleVariantsPanel } from "@/components/dashboard/locale-variants";

interface GeneratedVariant {
  platform: Platform;
  content: string;
  hashtags: string[];
  characterCount: number;
  withinLimit: boolean;
}

export default function CreatePostPage() {
  const router = useRouter();
  const [idea, setIdea] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>([]);
  const [tone, setTone] = useState("");
  const [generating, setGenerating] = useState(false);
  const [variants, setVariants] = useState<GeneratedVariant[]>([]);
  const [selectedVariant, setSelectedVariant] = useState<GeneratedVariant | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const togglePlatform = (platform: Platform) => {
    setSelectedPlatforms((prev) =>
      prev.includes(platform)
        ? prev.filter((p) => p !== platform)
        : [...prev, platform]
    );
  };

  const handleGenerate = async () => {
    if (!idea.trim() || selectedPlatforms.length === 0) {
      setError("Please enter an idea and select at least one platform");
      return;
    }

    setGenerating(true);
    setError(null);
    setVariants([]);

    try {
      const res = await fetch("/api/posts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          idea,
          platforms: selectedPlatforms,
          tone: tone || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to generate content");
      }

      setVariants(data.variants);
      if (data.variants.length > 0) {
        setSelectedVariant(data.variants[0]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate content");
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!selectedVariant) return;

    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: selectedVariant.content,
          platform: selectedVariant.platform,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save draft");
      }

      const post = await res.json();
      router.push(`/dashboard/drafts/${post.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save draft");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAllDrafts = async () => {
    if (variants.length === 0) return;

    setSaving(true);
    setError(null);

    try {
      for (const variant of variants) {
        await fetch("/api/posts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: variant.content,
            platform: variant.platform,
          }),
        });
      }
      router.push("/dashboard/drafts");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save drafts");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col">
      <Header 
        title="Create Post" 
        description="Draft content with AI assistance"
      />
      
      <div className="flex-1 p-6">
        <div className="mx-auto max-w-4xl space-y-6">
          {error && (
            <div className="rounded-md bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Content Idea</CardTitle>
              <CardDescription>
                Describe your content idea and we&apos;ll generate platform-optimized variants
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="idea">Your idea or topic</Label>
                <Textarea
                  id="idea"
                  placeholder="e.g., Share insights about our new product launch and its key features..."
                  value={idea}
                  onChange={(e) => setIdea(e.target.value)}
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <Label>Target platforms</Label>
                <div className="flex flex-wrap gap-2">
                  {Object.values(Platform).map((platform) => {
                    const Icon = platformIcons[platform];
                    const isSelected = selectedPlatforms.includes(platform);
                    return (
                      <Button
                        key={platform}
                        variant={isSelected ? "default" : "outline"}
                        size="sm"
                        onClick={() => togglePlatform(platform)}
                        className="gap-2"
                      >
                        <Icon className="h-4 w-4" />
                        {platform === "TWITTER" ? "X" : platform}
                        {isSelected && <Check className="h-3 w-3" />}
                      </Button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tone">Tone (optional)</Label>
                <Select value={tone} onValueChange={(v) => setTone(v || "")}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a tone..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="professional">Professional</SelectItem>
                    <SelectItem value="casual">Casual</SelectItem>
                    <SelectItem value="humorous">Humorous</SelectItem>
                    <SelectItem value="inspirational">Inspirational</SelectItem>
                    <SelectItem value="educational">Educational</SelectItem>
                    <SelectItem value="conversational">Conversational</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button 
                onClick={handleGenerate} 
                disabled={generating || !idea.trim() || selectedPlatforms.length === 0}
                className="w-full"
              >
                {generating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Wand2 className="mr-2 h-4 w-4" />
                    Generate Content
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          <LocaleVariantsPanel text={idea} />

          {variants.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Generated Variants</CardTitle>
                <CardDescription>
                  Select a variant to save as a draft or save all
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  {variants.map((variant, index) => {
                    const Icon = platformIcons[variant.platform];
                    const config = PLATFORM_CONFIGS[variant.platform];
                    const isSelected = selectedVariant?.platform === variant.platform;

                    return (
                      <Card
                        key={index}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? "ring-2 ring-primary" : ""
                        }`}
                        onClick={() => setSelectedVariant(variant)}
                      >
                        <CardHeader className="pb-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Icon className="h-4 w-4" />
                              <span className="font-medium">{variant.platform}</span>
                            </div>
                            <Badge 
                              variant={variant.withinLimit ? "default" : "destructive"}
                            >
                              {variant.characterCount}/{config.maxTextLength}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm whitespace-pre-wrap line-clamp-6">
                            {variant.content}
                          </p>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={handleSaveDraft}
                    disabled={saving || !selectedVariant}
                    className="flex-1"
                  >
                    {saving ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    Save Selected as Draft
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleSaveAllDrafts}
                    disabled={saving}
                  >
                    Save All ({variants.length})
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {!variants.length && (
            <Card>
              <CardHeader>
                <CardTitle>Or Create Manually</CardTitle>
                <CardDescription>
                  Write content directly without AI assistance
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ManualPostForm />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function ManualPostForm() {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [platform, setPlatform] = useState<Platform | "">("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedConfig = platform ? PLATFORM_CONFIGS[platform] : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || !platform) return;

    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, platform }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create post");
      }

      const post = await res.json();
      router.push(`/dashboard/drafts/${post.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create post");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="platform">Platform</Label>
        <Select 
          value={platform} 
          onValueChange={(v) => setPlatform(v as Platform)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select platform..." />
          </SelectTrigger>
          <SelectContent>
            {Object.values(Platform).map((p) => (
              <SelectItem key={p} value={p}>
                {p === "TWITTER" ? "X (Twitter)" : p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="content">Content</Label>
          {selectedConfig && (
            <span className={`text-xs ${
              content.length > selectedConfig.maxTextLength 
                ? "text-red-500" 
                : "text-muted-foreground"
            }`}>
              {content.length}/{selectedConfig.maxTextLength}
            </span>
          )}
        </div>
        <Textarea
          id="content"
          placeholder="Write your post content..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={6}
        />
      </div>

      <Button 
        type="submit" 
        disabled={saving || !content.trim() || !platform}
        className="w-full"
      >
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Create Draft
      </Button>
    </form>
  );
}
