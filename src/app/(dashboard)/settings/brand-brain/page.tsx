"use client";

import { useCallback, useEffect, useState } from "react";
import { Header } from "@/components/dashboard/header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  Save,
  Brain,
  Target,
  MessageSquare,
} from "lucide-react";

interface BrandBrain {
  id?: string;
  brandName: string | null;
  industry: string | null;
  description: string | null;
  targetAudience: string | null;
  uniqueValue: string | null;
  tone: string | null;
  personality: string | null;
  writingStyle: string | null;
  avoidTopics: string | null;
  keyPhrases: string | null;
  primaryGoal: string | null;
  contentPillars: string | null;
  callToAction: string | null;
  hashtagStrategy: string | null;
}

const TONE_OPTIONS = [
  "Professional",
  "Casual",
  "Friendly",
  "Authoritative",
  "Inspirational",
  "Educational",
  "Humorous",
  "Conversational",
];

const INDUSTRY_OPTIONS = [
  "Technology",
  "Finance",
  "Healthcare",
  "Education",
  "E-commerce",
  "Marketing",
  "Real Estate",
  "Consulting",
  "Entertainment",
  "Non-profit",
  "Other",
];

const GOAL_OPTIONS = [
  "Brand Awareness",
  "Lead Generation",
  "Community Building",
  "Thought Leadership",
  "Sales & Conversions",
  "Customer Engagement",
  "Traffic & Visibility",
  "Education & Information",
];

const emptyBrandBrain: BrandBrain = {
  brandName: null,
  industry: null,
  description: null,
  targetAudience: null,
  uniqueValue: null,
  tone: null,
  personality: null,
  writingStyle: null,
  avoidTopics: null,
  keyPhrases: null,
  primaryGoal: null,
  contentPillars: null,
  callToAction: null,
  hashtagStrategy: null,
};

export default function BrandBrainPage() {
  const [brandBrain, setBrandBrain] = useState<BrandBrain>(emptyBrandBrain);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const fetchBrandBrain = useCallback(async () => {
    try {
      const res = await fetch("/api/brand-brain");
      const data = await res.json();
      if (data.brandBrain) {
        setBrandBrain(data.brandBrain);
      }
    } catch (error) {
      console.error("Failed to fetch brand brain:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBrandBrain();
  }, [fetchBrandBrain]);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/brand-brain", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(brandBrain),
      });

      const data = await res.json();

      if (res.ok) {
        setMessage({ type: "success", text: "Brand brain saved successfully!" });
        if (data.brandBrain) {
          setBrandBrain(data.brandBrain);
        }
      } else {
        setMessage({ type: "error", text: data.error || "Failed to save" });
      }
    } catch {
      setMessage({ type: "error", text: "Failed to save brand brain" });
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: keyof BrandBrain, value: string | null) => {
    setBrandBrain((prev) => ({ ...prev, [field]: value || null }));
  };

  if (loading) {
    return (
      <div className="flex flex-col">
        <Header
          title="Brand Brain"
          description="Define your brand identity for AI-powered content"
        />
        <div className="flex-1 flex items-center justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <Header
        title="Brand Brain"
        description="Define your brand identity for AI-powered content"
      />

      <div className="flex-1 p-6">
        <div className="mx-auto max-w-4xl space-y-6">
          {message && (
            <div
              className={`rounded-md p-4 flex items-center gap-2 ${
                message.type === "success"
                  ? "bg-green-50 text-green-700"
                  : "bg-red-50 text-red-700"
              }`}
            >
              {message.type === "success" ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              {message.text}
            </div>
          )}

          <Tabs defaultValue="profile" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="profile" className="flex items-center gap-2">
                <Brain className="h-4 w-4" />
                Brand Profile
              </TabsTrigger>
              <TabsTrigger value="voice" className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Brand Voice
              </TabsTrigger>
              <TabsTrigger value="goals" className="flex items-center gap-2">
                <Target className="h-4 w-4" />
                Goals & Strategy
              </TabsTrigger>
            </TabsList>

            <TabsContent value="profile" className="space-y-4 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Brand Identity</CardTitle>
                  <CardDescription>
                    Basic information about your brand that the AI will use to
                    maintain consistency
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="brandName">Brand Name</Label>
                      <Input
                        id="brandName"
                        placeholder="Your brand or business name"
                        value={brandBrain.brandName || ""}
                        onChange={(e) => updateField("brandName", e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="industry">Industry</Label>
                      <Select
                        value={brandBrain.industry || ""}
                        onValueChange={(v) => updateField("industry", v)}
                      >
                        <SelectTrigger id="industry">
                          <SelectValue placeholder="Select your industry" />
                        </SelectTrigger>
                        <SelectContent>
                          {INDUSTRY_OPTIONS.map((industry) => (
                            <SelectItem key={industry} value={industry}>
                              {industry}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">Brand Description</Label>
                    <Textarea
                      id="description"
                      placeholder="Describe what your brand does and what makes it special..."
                      className="min-h-[100px]"
                      value={brandBrain.description || ""}
                      onChange={(e) => updateField("description", e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="targetAudience">Target Audience</Label>
                    <Textarea
                      id="targetAudience"
                      placeholder="Who is your ideal customer? Demographics, interests, pain points..."
                      className="min-h-[80px]"
                      value={brandBrain.targetAudience || ""}
                      onChange={(e) =>
                        updateField("targetAudience", e.target.value)
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="uniqueValue">Unique Value Proposition</Label>
                    <Textarea
                      id="uniqueValue"
                      placeholder="What sets you apart from competitors? Why should people choose you?"
                      className="min-h-[80px]"
                      value={brandBrain.uniqueValue || ""}
                      onChange={(e) => updateField("uniqueValue", e.target.value)}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="voice" className="space-y-4 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Voice & Tone</CardTitle>
                  <CardDescription>
                    How your brand communicates with its audience
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="tone">Primary Tone</Label>
                      <Select
                        value={brandBrain.tone || ""}
                        onValueChange={(v) => updateField("tone", v)}
                      >
                        <SelectTrigger id="tone">
                          <SelectValue placeholder="Select your tone" />
                        </SelectTrigger>
                        <SelectContent>
                          {TONE_OPTIONS.map((tone) => (
                            <SelectItem key={tone} value={tone}>
                              {tone}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="personality">Brand Personality</Label>
                      <Input
                        id="personality"
                        placeholder="e.g., Innovative, Trustworthy, Bold"
                        value={brandBrain.personality || ""}
                        onChange={(e) =>
                          updateField("personality", e.target.value)
                        }
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="writingStyle">Writing Style</Label>
                    <Textarea
                      id="writingStyle"
                      placeholder="Describe how you write: sentence length, vocabulary level, use of emojis, etc."
                      className="min-h-[80px]"
                      value={brandBrain.writingStyle || ""}
                      onChange={(e) =>
                        updateField("writingStyle", e.target.value)
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="keyPhrases">Key Phrases & Terminology</Label>
                    <Textarea
                      id="keyPhrases"
                      placeholder="Words, phrases, or industry terms you frequently use..."
                      className="min-h-[80px]"
                      value={brandBrain.keyPhrases || ""}
                      onChange={(e) => updateField("keyPhrases", e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="avoidTopics">Topics to Avoid</Label>
                    <Textarea
                      id="avoidTopics"
                      placeholder="Subjects, words, or themes your brand should never mention..."
                      className="min-h-[80px]"
                      value={brandBrain.avoidTopics || ""}
                      onChange={(e) => updateField("avoidTopics", e.target.value)}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="goals" className="space-y-4 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Goals & Strategy</CardTitle>
                  <CardDescription>
                    What you want to achieve with your social media presence
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="primaryGoal">Primary Goal</Label>
                    <Select
                      value={brandBrain.primaryGoal || ""}
                      onValueChange={(v) => updateField("primaryGoal", v)}
                    >
                      <SelectTrigger id="primaryGoal">
                        <SelectValue placeholder="What's your main objective?" />
                      </SelectTrigger>
                      <SelectContent>
                        {GOAL_OPTIONS.map((goal) => (
                          <SelectItem key={goal} value={goal}>
                            {goal}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="contentPillars">Content Pillars</Label>
                    <Textarea
                      id="contentPillars"
                      placeholder="3-5 core themes your content revolves around (e.g., Industry News, Tips & Tutorials, Behind the Scenes)"
                      className="min-h-[80px]"
                      value={brandBrain.contentPillars || ""}
                      onChange={(e) =>
                        updateField("contentPillars", e.target.value)
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="callToAction">Preferred Call-to-Action</Label>
                    <Input
                      id="callToAction"
                      placeholder="e.g., Learn more, Sign up, Join us, Get started"
                      value={brandBrain.callToAction || ""}
                      onChange={(e) =>
                        updateField("callToAction", e.target.value)
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="hashtagStrategy">Hashtag Strategy</Label>
                    <Textarea
                      id="hashtagStrategy"
                      placeholder="Your branded hashtags and preferred hashtag approach..."
                      className="min-h-[80px]"
                      value={brandBrain.hashtagStrategy || ""}
                      onChange={(e) =>
                        updateField("hashtagStrategy", e.target.value)
                      }
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving} size="lg">
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save Brand Brain
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
