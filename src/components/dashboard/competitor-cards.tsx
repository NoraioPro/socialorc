import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  averageOverlap,
  getCompetitorDigest,
  rankByThreat,
  type CompetitorCard,
  type ThreatLevel,
} from "@/lib/competitor";
import { Swords } from "lucide-react";

const threatBadge: Record<ThreatLevel, string> = {
  high: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  low: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
};

function CompetitorCardView({ competitor }: { competitor: CompetitorCard }) {
  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium truncate">{competitor.name}</p>
          <p className="text-xs text-muted-foreground truncate">
            {competitor.handle} · {competitor.platform}
          </p>
        </div>
        <Badge className={`text-xs shrink-0 ${threatBadge[competitor.threatLevel]}`}>
          {competitor.threatLevel}
        </Badge>
      </div>
      <p className="text-sm">{competitor.lastMove}</p>
      <p className="text-xs text-muted-foreground">{competitor.signalSummary}</p>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Theme overlap</span>
        <span className="font-medium">{competitor.overlapScore}</span>
      </div>
    </div>
  );
}

/** Command-center competitor panel — mock data only, no scraping. */
export function CompetitorCardsPanel() {
  const digest = getCompetitorDigest();
  const ranked = rankByThreat(digest.competitors);
  const avg = averageOverlap(digest.competitors);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Swords className="h-5 w-5 text-primary" />
            <CardTitle>Competitors</CardTitle>
          </div>
          <Badge variant="outline" className="text-xs">
            mock · no scraping
          </Badge>
        </div>
        <CardDescription>
          Stub competitive intel for the command center. Avg theme overlap {avg}. Source:{" "}
          {digest.source}.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        {ranked.map((c) => (
          <CompetitorCardView key={c.id} competitor={c} />
        ))}
      </CardContent>
    </Card>
  );
}
