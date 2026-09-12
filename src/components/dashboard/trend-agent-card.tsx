import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Minus, Radar, TrendingDown, TrendingUp } from "lucide-react";
import {
  actionLabel,
  buildTrendDigest,
  DEFAULT_BRAND_CONTEXT,
  MOCK_TRENDING_TOPICS,
  momentumLabel,
  TREND_FIXTURE_NOTE,
  type BrandContext,
  type TrendAction,
  type TrendMomentum,
} from "@/lib/trend-agent";

const momentumStyles: Record<TrendMomentum, string> = {
  RISING: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  PEAKING: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  COOLING: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

const actionStyles: Record<TrendAction, string> = {
  ACT_NOW: "bg-primary text-primary-foreground",
  QUEUE: "bg-blue-500 text-white",
  WATCH: "bg-gray-500 text-white",
  SKIP: "bg-gray-300 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
};

function MomentumIcon({ momentum }: { momentum: TrendMomentum }) {
  if (momentum === "RISING") return <TrendingUp className="h-3 w-3" />;
  if (momentum === "COOLING") return <TrendingDown className="h-3 w-3" />;
  return <Minus className="h-3 w-3" />;
}

/**
 * Trend Agent card (P2, mock slice).
 *
 * Renders ranked trending topics from the in-repo fixture set — no scraping and
 * no live trend API. Server component: the digest is computed at render time
 * from pure helpers, so replacing MOCK_TRENDING_TOPICS with a real source is the
 * only change needed to make this live.
 */
export function TrendAgentCard({
  brand = DEFAULT_BRAND_CONTEXT,
  limit = 4,
  generatedAt = new Date().toISOString(),
}: {
  brand?: BrandContext;
  limit?: number;
  generatedAt?: string;
}) {
  const digest = buildTrendDigest(MOCK_TRENDING_TOPICS, brand, { limit, generatedAt });
  const topicsById = new Map(digest.topics.map((topic) => [topic.id, topic]));

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Radar className="h-4 w-4 text-primary" />
            Trend Agent
          </CardTitle>
          <CardDescription>{TREND_FIXTURE_NOTE}</CardDescription>
        </div>
        <Badge variant="outline" className="text-xs">
          MOCK
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">{digest.summary}</p>

        <div className="space-y-3">
          {digest.matches.map((match) => {
            const topic = topicsById.get(match.topicId);
            if (!topic) return null;
            return (
              <div key={match.topicId} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{topic.title}</span>
                  <Badge className={`text-xs ${momentumStyles[match.momentum]}`}>
                    <MomentumIcon momentum={match.momentum} />
                    {momentumLabel(match.momentum)}
                  </Badge>
                  <Badge className={`text-xs ${actionStyles[match.recommendation]}`}>
                    {actionLabel(match.recommendation)}
                  </Badge>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {match.overallScore}/100
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>Potential {match.viralPotential}</span>
                  <span>Relevance {match.relevance}</span>
                  <span>Headroom {match.competitionFactor}</span>
                  {topic.platforms.map((platform) => (
                    <Badge key={platform} variant="outline" className="text-xs">
                      {platform}
                    </Badge>
                  ))}
                </div>

                <p className="mt-2 text-xs text-muted-foreground">{match.suggestedAngle}</p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
