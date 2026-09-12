"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Platform } from "@prisma/client";
import { PLATFORM_CONFIGS } from "@/types/platform";
import { Loader2, Check, Layers, AlertCircle, Sparkles, Copy } from "lucide-react";
import { platformIcons } from "@/components/icons/platform-icons";

interface CascadeTarget {
  platform: Platform;
  name: string;
  maxTextLength: number;
}

interface CascadeAdaptation {
  platform: Platform;
  content: string;
  hashtags: string[];
  characterCount: number;
  withinLimit: boolean;
  adaptationNotes: string[];
}

interface CascadeDialogProps {
  open: boolean;
  onClose: () => void;
  postId: string;
  sourcePlatform: Platform;
  sourceContent: string;
}

export function CascadeDialog({
  open,
  onClose,
  postId,
  sourcePlatform,
  sourceContent,
}: CascadeDialogProps) {
  const router = useRouter();
  const [step, setStep] = useState<"select" | "preview" | "done">("select");
  const [availableTargets, setAvailableTargets] = useState<CascadeTarget[]>([]);
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>([]);
  const [adaptations, setAdaptations] = useState<CascadeAdaptation[]>([]);
  const [loading, setLoading] = useState(false);
  const [cascading, setCascading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usedMock, setUsedMock] = useState(false);
  const [createdDrafts, setCreatedDrafts] = useState<{ id: string; platform: Platform }[]>([]);

  useEffect(() => {
    if (open) {
      fetchAvailableTargets();
      setStep("select");
      setSelectedPlatforms([]);
      setAdaptations([]);
      setError(null);
      setCreatedDrafts([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, postId]);

  const fetchAvailableTargets = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/posts/${postId}/cascade`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to fetch targets");
      }
      const data = await res.json();
      setAvailableTargets(data.availableTargets);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load cascade options");
    } finally {
      setLoading(false);
    }
  };

  const togglePlatform = (platform: Platform) => {
    setSelectedPlatforms((prev) =>
      prev.includes(platform)
        ? prev.filter((p) => p !== platform)
        : [...prev, platform]
    );
  };

  const handleCascade = async (createDrafts = false) => {
    setCascading(true);
    setError(null);

    try {
      const res = await fetch(`/api/posts/${postId}/cascade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetPlatforms: selectedPlatforms,
          createDrafts,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to cascade");
      }

      const data = await res.json();
      setAdaptations(data.adaptations);
      setUsedMock(data.usedMock);

      if (createDrafts) {
        setCreatedDrafts(data.createdDrafts || []);
        setStep("done");
      } else {
        setStep("preview");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cascade content");
    } finally {
      setCascading(false);
    }
  };

  const handleSaveAsDrafts = async () => {
    await handleCascade(true);
  };

  const handleClose = () => {
    if (createdDrafts.length > 0) {
      router.push("/dashboard/drafts");
    }
    onClose();
  };

  const copyToClipboard = (content: string) => {
    navigator.clipboard.writeText(content);
  };

  const SourceIcon = platformIcons[sourcePlatform];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-purple-500" />
            Content Cascade
          </DialogTitle>
          <DialogDescription>
            {step === "select" && "Select platforms to adapt your content for"}
            {step === "preview" && "Preview and save your adapted content"}
            {step === "done" && "Your content has been cascaded"}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-md bg-red-50 p-4 text-sm text-red-700 flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        {step === "select" && (
          <div className="space-y-4">
            <div className="rounded-md bg-muted p-4">
              <div className="flex items-center gap-2 mb-2">
                <SourceIcon className="h-4 w-4" />
                <span className="font-medium">Source: {sourcePlatform}</span>
              </div>
              <p className="text-sm text-muted-foreground line-clamp-3">
                {sourceContent}
              </p>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Target Platforms</label>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {availableTargets.map((target) => {
                      const Icon = platformIcons[target.platform];
                      const isSelected = selectedPlatforms.includes(target.platform);
                      return (
                        <Button
                          key={target.platform}
                          variant={isSelected ? "default" : "outline"}
                          size="sm"
                          onClick={() => togglePlatform(target.platform)}
                          className="justify-start gap-2"
                        >
                          <Icon className="h-4 w-4" />
                          {target.name}
                          {isSelected && <Check className="ml-auto h-3 w-3" />}
                        </Button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <Button variant="outline" onClick={handleClose}>
                    Cancel
                  </Button>
                  <Button
                    onClick={() => handleCascade(false)}
                    disabled={cascading || selectedPlatforms.length === 0}
                  >
                    {cascading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="mr-2 h-4 w-4" />
                    )}
                    Preview Adaptations
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-4">
            {usedMock && (
              <div className="rounded-md bg-yellow-50 p-3 text-sm text-yellow-700">
                <strong>Mock Mode:</strong> AI is not configured. Using template-based adaptations.
              </div>
            )}

            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {adaptations.map((adaptation, index) => {
                const Icon = platformIcons[adaptation.platform];
                const config = PLATFORM_CONFIGS[adaptation.platform];
                return (
                  <Card key={index}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4" />
                          <span className="font-medium">{config.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={adaptation.withinLimit ? "default" : "destructive"}
                          >
                            {adaptation.characterCount}/{config.maxTextLength}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(adaptation.content)}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm whitespace-pre-wrap mb-2">
                        {adaptation.content}
                      </p>
                      {adaptation.adaptationNotes.length > 0 && (
                        <div className="text-xs text-muted-foreground">
                          {adaptation.adaptationNotes.map((note, i) => (
                            <span key={i} className="inline-block mr-2">
                              • {note}
                            </span>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <div className="flex justify-between gap-2 pt-4">
              <Button variant="outline" onClick={() => setStep("select")}>
                Back
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleClose}>
                  Done (Copy Only)
                </Button>
                <Button onClick={handleSaveAsDrafts} disabled={cascading}>
                  {cascading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="mr-2 h-4 w-4" />
                  )}
                  Save All as Drafts
                </Button>
              </div>
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="space-y-4">
            <div className="rounded-md bg-green-50 p-4 text-center">
              <Check className="h-8 w-8 text-green-500 mx-auto mb-2" />
              <p className="font-medium text-green-700">
                Created {createdDrafts.length} draft{createdDrafts.length !== 1 ? "s" : ""}!
              </p>
            </div>

            <div className="space-y-2">
              {createdDrafts.map((draft) => {
                const Icon = platformIcons[draft.platform];
                return (
                  <div
                    key={draft.id}
                    className="flex items-center gap-2 p-2 rounded-md bg-muted"
                  >
                    <Icon className="h-4 w-4" />
                    <span>{draft.platform}</span>
                    <Badge variant="secondary" className="ml-auto">
                      Draft
                    </Badge>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end pt-4">
              <Button onClick={handleClose}>
                Go to Drafts
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
