"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CampaignReadinessScore,
  CampaignReadinessInput,
  calculateCampaignReadiness,
} from "@/lib/campaign-readiness";
import {
  Rocket,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ChevronRight,
  Zap,
} from "lucide-react";

interface CampaignReadinessCardProps {
  input: CampaignReadinessInput;
}

function ScoreRing({
  score,
  grade,
}: {
  score: number;
  grade: CampaignReadinessScore["grade"];
}) {
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  const gradeColors: Record<CampaignReadinessScore["grade"], string> = {
    excellent: "stroke-green-500",
    good: "stroke-blue-500",
    fair: "stroke-yellow-500",
    "needs-work": "stroke-orange-500",
    "not-ready": "stroke-red-500",
  };

  const gradeBgColors: Record<CampaignReadinessScore["grade"], string> = {
    excellent: "text-green-500",
    good: "text-blue-500",
    fair: "text-yellow-500",
    "needs-work": "text-orange-500",
    "not-ready": "text-red-500",
  };

  return (
    <div className="relative flex items-center justify-center">
      <svg className="h-32 w-32 -rotate-90 transform">
        <circle
          cx="64"
          cy="64"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          className="text-muted/20"
        />
        <circle
          cx="64"
          cy="64"
          r={radius}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className={`transition-all duration-1000 ease-out ${gradeColors[grade]}`}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className={`text-3xl font-bold ${gradeBgColors[grade]}`}>
          {score}
        </span>
        <span className="text-xs text-muted-foreground">/ 100</span>
      </div>
    </div>
  );
}

function GradeBadge({ grade }: { grade: CampaignReadinessScore["grade"] }) {
  const config: Record<
    CampaignReadinessScore["grade"],
    { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
  > = {
    excellent: { label: "Excellent", variant: "default" },
    good: { label: "Good", variant: "default" },
    fair: { label: "Fair", variant: "secondary" },
    "needs-work": { label: "Needs Work", variant: "outline" },
    "not-ready": { label: "Not Ready", variant: "destructive" },
  };

  const { label, variant } = config[grade];

  return <Badge variant={variant}>{label}</Badge>;
}

function BreakdownItem({
  label,
  score,
  max,
  details,
}: {
  label: string;
  score: number;
  max: number;
  details: string;
}) {
  const percent = Math.round((score / max) * 100);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">
          {score}/{max}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary transition-all duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">{details}</p>
    </div>
  );
}

function RecommendationBanner({
  recommendation,
}: {
  recommendation: CampaignReadinessScore["recommendation"];
}) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        recommendation.startAmplification
          ? "border-green-500/50 bg-green-500/10"
          : "border-yellow-500/50 bg-yellow-500/10"
      }`}
    >
      <div className="flex items-start gap-3">
        {recommendation.startAmplification ? (
          <Rocket className="mt-0.5 h-5 w-5 text-green-500" />
        ) : (
          <AlertTriangle className="mt-0.5 h-5 w-5 text-yellow-500" />
        )}
        <div className="flex-1">
          <p className="font-medium">
            {recommendation.startAmplification
              ? "Ready for Paid Amplification"
              : "Not Yet Ready"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {recommendation.reason}
          </p>
        </div>
        {recommendation.startAmplification && (
          <Button size="sm" className="gap-1">
            <Zap className="h-4 w-4" />
            Start Campaign
          </Button>
        )}
      </div>
    </div>
  );
}

function ImprovementsList({ improvements }: { improvements: string[] }) {
  if (improvements.length === 0) return null;

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium">Suggested Improvements</h4>
      <ul className="space-y-1">
        {improvements.map((improvement, i) => (
          <li
            key={i}
            className="flex items-start gap-2 text-sm text-muted-foreground"
          >
            <ChevronRight className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{improvement}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CampaignReadinessCard({ input }: CampaignReadinessCardProps) {
  const result = calculateCampaignReadiness(input);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Campaign Readiness
            </CardTitle>
            <CardDescription>
              Your readiness to launch paid amplification
            </CardDescription>
          </div>
          <GradeBadge grade={result.grade} />
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-col items-center gap-4 md:flex-row md:items-start">
          <ScoreRing score={result.score} grade={result.grade} />

          <div className="flex-1 space-y-3">
            <BreakdownItem
              label="Content Pipeline"
              score={result.breakdown.contentPipeline.score}
              max={result.breakdown.contentPipeline.max}
              details={result.breakdown.contentPipeline.details}
            />
            <BreakdownItem
              label="Platform Coverage"
              score={result.breakdown.platformCoverage.score}
              max={result.breakdown.platformCoverage.max}
              details={result.breakdown.platformCoverage.details}
            />
            <BreakdownItem
              label="Queue Depth"
              score={result.breakdown.queueDepth.score}
              max={result.breakdown.queueDepth.max}
              details={result.breakdown.queueDepth.details}
            />
            <BreakdownItem
              label="Track Record"
              score={result.breakdown.trackRecord.score}
              max={result.breakdown.trackRecord.max}
              details={result.breakdown.trackRecord.details}
            />
            <BreakdownItem
              label="Workflow Compliance"
              score={result.breakdown.workflowCompliance.score}
              max={result.breakdown.workflowCompliance.max}
              details={result.breakdown.workflowCompliance.details}
            />
          </div>
        </div>

        <RecommendationBanner recommendation={result.recommendation} />

        <ImprovementsList improvements={result.improvements} />
      </CardContent>
    </Card>
  );
}

export function CampaignReadinessCompact({ input }: CampaignReadinessCardProps) {
  const result = calculateCampaignReadiness(input);

  const gradeIcons: Record<CampaignReadinessScore["grade"], React.ReactNode> = {
    excellent: <CheckCircle2 className="h-5 w-5 text-green-500" />,
    good: <CheckCircle2 className="h-5 w-5 text-blue-500" />,
    fair: <AlertTriangle className="h-5 w-5 text-yellow-500" />,
    "needs-work": <AlertTriangle className="h-5 w-5 text-orange-500" />,
    "not-ready": <XCircle className="h-5 w-5 text-red-500" />,
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Campaign Readiness</CardTitle>
        {gradeIcons[result.grade]}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{result.score}</div>
        <p className="text-xs text-muted-foreground">
          {result.recommendation.startAmplification
            ? "Ready for paid campaigns"
            : result.improvements[0] || "Build your content pipeline"}
        </p>
      </CardContent>
    </Card>
  );
}
