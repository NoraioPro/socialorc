import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  averageGrowthSignal,
  getNetworkDiscoveryDigest,
  rankForExperiments,
  type EmergingNetworkCard,
  type ExperimentPriority,
} from "@/lib/network-discovery";
import { Radar } from "lucide-react";

const priorityBadge: Record<ExperimentPriority, string> = {
  "experiment-early": "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  watch: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  defer: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
};

function NetworkCardView({ network }: { network: EmergingNetworkCard }) {
  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium truncate">{network.name}</p>
          <p className="text-xs text-muted-foreground truncate">
            {network.handleHint} · {network.maturity}
          </p>
        </div>
        <Badge
          className={`text-xs shrink-0 ${priorityBadge[network.priority]}`}
        >
          {network.priority}
        </Badge>
      </div>
      <p className="text-sm">{network.whyNow}</p>
      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground/80">Try: </span>
        {network.experimentIdea}
      </p>
      <div className="flex items-center justify-between text-xs gap-3">
        <span className="text-muted-foreground">Audience fit {network.audienceFit}</span>
        <span className="font-medium">Growth {network.growthSignal}</span>
      </div>
    </div>
  );
}

/** Command-center network discovery — mock only, no live crawl. */
export function NetworkDiscoveryPanel() {
  const digest = getNetworkDiscoveryDigest();
  const ranked = rankForExperiments(digest.networks);
  const avgGrowth = averageGrowthSignal(digest.networks);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Radar className="h-5 w-5 text-primary" />
            <CardTitle>Network Discovery</CardTitle>
          </div>
          <Badge variant="outline" className="text-xs">
            mock · no crawl
          </Badge>
        </div>
        <CardDescription>
          {digest.headlineRec} Avg growth signal {avgGrowth}. Source: {digest.source}.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        {ranked.map((n) => (
          <NetworkCardView key={n.id} network={n} />
        ))}
      </CardContent>
    </Card>
  );
}
