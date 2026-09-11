"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/dashboard/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Platform } from "@prisma/client";
import { PLATFORM_CONFIGS } from "@/types/platform";
import { BrandContext } from "@/types/brand-brain";
import { 
  Wand2, 
  Loader2, 
  Check, 
  Sparkles, 
  Brain, 
  AlertCircle,
  Copy,
  Save,
  RefreshCw,
} from "lucide-react";
import { platformIcons } from "@/components/icons/platform-icons";

interface GeneratedVariant {
  platform: Platform;
  content: string;
  hashtags: string[];
  characterCount: number;
  withinLimit: boolean;
  isMock?: boolean;
}

interface AIStudioStatus {
  openAIAvailable: boolean;
  mockBrandContext: BrandContext;
}

export default function AIStudioPage() {
  const router = useRouter();
  const [status, setStatus] = useState<AIStudioStatus | null>(null);
  const [idea, setIdea] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>([]);
  const [tone, setTone] = useState("");
  const [generating, setGenerating] = useState(false);
  const [variants, setVariants] = useState<GeneratedVariant[]>([]);
  const [selectedVariant, setSelectedVariant] = useState<GeneratedVariant | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usedMock, setUsedMock] = useState(false);
  
  const [brandContext, setBrandContext] = useState<BrandContext>({});
  const [showBrandConfig, setShowBrandConfig] = useState(false);
  
  const [improveInstruction, setImproveInstruction] = useState("");
  const [improving, setImproving] = useState(false);

  useEffect(() => {
    const loadStatus = async () => {
      try {
        const res = await fetch("/api/ai-studio");
        const data = await res.json();
        if (data.success) {
          setStatus(data);
          if (!brandContext.profile) {
            setBrandContext(data.mockBrandContext);
          }
        }
      } catch (err) {
        console.error("Failed to fetch AI Studio status:", err);
      }
    };
    loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const togglePlatform = (platform: Platform) => {
    setSelectedPlatforms((prev) =>
      prev.includes(platform)
        ? prev.filter((p) => p !== platform)
        : [...prev, platform]
    );
  };

  const selectAllPlatforms = () => {
    setSelectedPlatforms(Object.values(Platform));
  };

  const handleGenerate = async () => {
    if (!idea.trim() || selectedPlatforms.length === 0) {
      setError("Please enter an idea and select at least one platform");
      return;
    }

    setGenerating(true);
    setError(null);
    setVariants([]);
    setUsedMock(false);

    try {
      const res = await fetch("/api/ai-studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          idea,
          platforms: selectedPlatforms,
          tone: tone || undefined,
          brandContext: showBrandConfig ? brandContext : undefined,
        }),
      });

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to generate content");
      }

      setVariants(data.variants);
      setUsedMock(data.usedMock);
      if (data.variants.length > 0) {
        setSelectedVariant(data.variants[0]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate content");
    } finally {
      setGenerating(false);
    }
  };

  const handleImprove = async () => {
    if (!selectedVariant || !improveInstruction.trim()) return;

    setImproving(true);
    setError(null);

    try {
      const res = await fetch("/api/ai-studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "improve",
          content: selectedVariant.content,
          platform: selectedVariant.platform,
          instruction: improveInstruction,
        }),
      });

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to improve content");
      }

      const updatedVariant: GeneratedVariant = {
        ...selectedVariant,
        content: data.content,
        characterCount: data.content.length,
        withinLimit: data.content.length <= PLATFORM_CONFIGS[selectedVariant.platform].maxTextLength,
        isMock: data.usedMock,
      };

      setVariants((prev) =>
        prev.map((v) =>
          v.platform === selectedVariant.platform ? updatedVariant : v
        )
      );
      setSelectedVariant(updatedVariant);
      setImproveInstruction("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to improve content");
    } finally {
      setImproving(false);
    }
  };

  const handleSaveDraft = async (variant: GeneratedVariant) => {
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: variant.content,
          platform: variant.platform,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save draft");
      }

      await res.json();
      router.push(`/dashboard/drafts`);
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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="flex flex-col">
      <Header 
        title="AI Studio" 
        description="Transform one idea into platform-optimized content"
      />
      
      <div className="flex-1 p-6">
        <div className="mx-auto max-w-6xl space-y-6">
          {status && !status.openAIAvailable && (
            <div className="flex items-center gap-2 rounded-md bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <div>
                <strong>Mock Mode Active:</strong> OpenAI API key not configured. 
                AI Studio will generate deterministic mock content for testing.
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-md bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5" />
                    Content Idea
                  </CardTitle>
                  <CardDescription>
                    Enter your content idea and select target platforms
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="idea">Your idea or topic</Label>
                    <Textarea
                      id="idea"
                      placeholder="e.g., Share insights about our new product launch and its key features for improving productivity..."
                      value={idea}
                      onChange={(e) => setIdea(e.target.value)}
                      rows={4}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Target platforms</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={selectAllPlatforms}
                        className="text-xs"
                      >
                        Select All
                      </Button>
                    </div>
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
                        Generating Variants...
                      </>
                    ) : (
                      <>
                        <Wand2 className="mr-2 h-4 w-4" />
                        Generate Platform Variants
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Brain className="h-5 w-5" />
                    Brand Brain
                    <Badge variant="outline" className="ml-2">
                      {showBrandConfig ? "Configured" : "Using Defaults"}
                    </Badge>
                  </CardTitle>
                  <CardDescription>
                    Configure your brand voice for consistent content
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    variant="outline"
                    onClick={() => setShowBrandConfig(!showBrandConfig)}
                    className="w-full"
                  >
                    {showBrandConfig ? "Hide Brand Configuration" : "Configure Brand Voice"}
                  </Button>

                  {showBrandConfig && (
                    <div className="mt-4 space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="brandName">Brand Name</Label>
                        <Input
                          id="brandName"
                          value={brandContext.profile?.name || ""}
                          onChange={(e) =>
                            setBrandContext((prev) => ({
                              ...prev,
                              profile: { ...prev.profile, name: e.target.value },
                            }))
                          }
                          placeholder="Your brand name"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="brandTagline">Tagline</Label>
                        <Input
                          id="brandTagline"
                          value={brandContext.profile?.tagline || ""}
                          onChange={(e) =>
                            setBrandContext((prev) => ({
                              ...prev,
                              profile: { ...prev.profile, tagline: e.target.value },
                            }))
                          }
                          placeholder="Your brand tagline"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="voiceTone">Voice Tone Keywords</Label>
                        <Input
                          id="voiceTone"
                          value={brandContext.voice?.toneKeywords?.join(", ") || ""}
                          onChange={(e) =>
                            setBrandContext((prev) => ({
                              ...prev,
                              voice: {
                                ...prev.voice,
                                toneKeywords: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                              },
                            }))
                          }
                          placeholder="e.g., professional, friendly, innovative"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="targetAudience">Target Audience</Label>
                        <Input
                          id="targetAudience"
                          value={brandContext.profile?.targetAudience || ""}
                          onChange={(e) =>
                            setBrandContext((prev) => ({
                              ...prev,
                              profile: { ...prev.profile, targetAudience: e.target.value },
                            }))
                          }
                          placeholder="Who is your content for?"
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              {variants.length > 0 ? (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Generated Variants</CardTitle>
                        <CardDescription>
                          {usedMock && (
                            <span className="text-amber-600">
                              (Mock generated - no OpenAI)
                            </span>
                          )}
                        </CardDescription>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleSaveAllDrafts}
                        disabled={saving}
                      >
                        <Save className="mr-2 h-4 w-4" />
                        Save All ({variants.length})
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Tabs
                      value={selectedVariant?.platform || variants[0]?.platform}
                      onValueChange={(v) => {
                        const variant = variants.find((vr) => vr.platform === v);
                        if (variant) setSelectedVariant(variant);
                      }}
                    >
                      <TabsList className="flex flex-wrap h-auto gap-1">
                        {variants.map((variant) => {
                          const Icon = platformIcons[variant.platform];
                          return (
                            <TabsTrigger
                              key={variant.platform}
                              value={variant.platform}
                              className="gap-1"
                            >
                              <Icon className="h-3 w-3" />
                              {variant.platform === "TWITTER" ? "X" : variant.platform}
                            </TabsTrigger>
                          );
                        })}
                      </TabsList>

                      {variants.map((variant) => {
                        const config = PLATFORM_CONFIGS[variant.platform];
                        return (
                          <TabsContent key={variant.platform} value={variant.platform}>
                            <div className="space-y-4">
                              <div className="flex items-center justify-between">
                                <Badge variant={variant.withinLimit ? "default" : "destructive"}>
                                  {variant.characterCount}/{config.maxTextLength} chars
                                </Badge>
                                {variant.isMock && (
                                  <Badge variant="outline">Mock</Badge>
                                )}
                              </div>

                              <div className="rounded-md border p-4 bg-muted/50">
                                <pre className="whitespace-pre-wrap text-sm font-sans">
                                  {variant.content}
                                </pre>
                              </div>

                              <div className="flex gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => copyToClipboard(variant.content)}
                                >
                                  <Copy className="mr-2 h-4 w-4" />
                                  Copy
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => handleSaveDraft(variant)}
                                  disabled={saving}
                                >
                                  <Save className="mr-2 h-4 w-4" />
                                  Save as Draft
                                </Button>
                              </div>

                              <div className="border-t pt-4 mt-4">
                                <Label className="text-sm font-medium">Refine Content</Label>
                                <div className="flex gap-2 mt-2">
                                  <Input
                                    value={improveInstruction}
                                    onChange={(e) => setImproveInstruction(e.target.value)}
                                    placeholder="e.g., make it shorter, add emojis, more professional..."
                                    className="flex-1"
                                  />
                                  <Button
                                    onClick={handleImprove}
                                    disabled={improving || !improveInstruction.trim()}
                                    size="sm"
                                  >
                                    {improving ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <RefreshCw className="h-4 w-4" />
                                    )}
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </TabsContent>
                        );
                      })}
                    </Tabs>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle>Generated Variants</CardTitle>
                    <CardDescription>
                      Your platform-optimized content will appear here
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Sparkles className="h-12 w-12 mb-4 opacity-50" />
                    <p>Enter an idea and click &quot;Generate&quot; to create content</p>
                    <p className="text-sm mt-2">
                      AI Studio transforms one idea into variants tailored for each platform
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
