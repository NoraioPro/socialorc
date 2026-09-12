"use client";

import { Header } from "@/components/dashboard/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  MOCK_REGIONS,
  MOCK_REGION_METRICS,
  MOCK_OPPORTUNITY_SCORES,
  formatPopulation,
  formatReach,
  getCompetitionColor,
  getScoreColor,
  getScoreBgColor,
  getRecommendationBadgeColor,
  getTopRegionsByScore,
  getRegionsByContinent,
} from "@/lib/global-map";
import type { Region, RegionMetrics, OpportunityScore } from "@/lib/global-map";
import { Globe2, TrendingUp, Users, Activity, Clock, Zap, Target, BarChart3 } from "lucide-react";

function RegionCard({
  region,
  metrics,
  opportunity,
}: {
  region: Region;
  metrics: RegionMetrics;
  opportunity: OpportunityScore;
}) {
  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-lg font-bold">
              {region.code}
            </div>
            <div>
              <CardTitle className="text-base">{region.name}</CardTitle>
              <CardDescription className="text-xs">
                {formatPopulation(region.population)} pop · {Math.round(region.internetPenetration * 100)}% online
              </CardDescription>
            </div>
          </div>
          <div className="text-right">
            <div className={`text-2xl font-bold ${getScoreColor(opportunity.overallScore)}`}>
              {opportunity.overallScore}
            </div>
            <div className="text-xs text-muted-foreground">Score</div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-green-500" />
            <span className="text-muted-foreground">Growth</span>
            <span className="ml-auto font-medium">{opportunity.growthPotential}%</span>
          </div>
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-blue-500" />
            <span className="text-muted-foreground">Reach</span>
            <span className="ml-auto font-medium">{formatReach(metrics.totalReach)}</span>
          </div>
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-purple-500" />
            <span className="text-muted-foreground">Engage</span>
            <span className="ml-auto font-medium">{opportunity.engagementPotential}%</span>
          </div>
          <div className="flex items-center gap-2">
            <Target className={`h-4 w-4 ${getCompetitionColor(metrics.competitionLevel)}`} />
            <span className="text-muted-foreground">Comp.</span>
            <span className={`ml-auto font-medium ${getCompetitionColor(metrics.competitionLevel)}`}>
              {metrics.competitionLevel.replace("_", " ")}
            </span>
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2">
            <Zap className="h-4 w-4 text-amber-500" />
            <span className="text-xs font-medium text-muted-foreground">TOP CATEGORIES</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {metrics.trendingCategories.slice(0, 3).map((cat) => (
              <Badge key={cat} variant="secondary" className="text-xs">
                {cat}
              </Badge>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2">
            <Clock className="h-4 w-4 text-cyan-500" />
            <span className="text-xs font-medium text-muted-foreground">BEST TIMES</span>
          </div>
          <div className="text-xs text-muted-foreground">
            {metrics.bestPostingTimes.slice(0, 2).join(" · ")}
          </div>
        </div>

        <div className="pt-2 border-t">
          <Badge className={`${getRecommendationBadgeColor(opportunity.recommendation)}`}>
            {opportunity.recommendation.replace("_", " ")}
          </Badge>
          {opportunity.insights.length > 0 && (
            <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
              {opportunity.insights[0]}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function TopOpportunitiesPanel({ opportunities }: { opportunities: OpportunityScore[] }) {
  const topRegions = getTopRegionsByScore(opportunities, 5);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          Top Opportunities
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {topRegions.map((opp, idx) => {
            const region = MOCK_REGIONS.find((r) => r.id === opp.regionId)!;
            return (
              <div key={opp.regionId} className="flex items-center gap-3">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold">
                  {idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{region.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatReach(MOCK_REGION_METRICS.find((m) => m.regionId === opp.regionId)?.totalReach || 0)} reach
                  </div>
                </div>
                <div className={`text-lg font-bold ${getScoreColor(opp.overallScore)}`}>
                  {opp.overallScore}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function GlobalStatsPanel() {
  const totalReach = MOCK_REGION_METRICS.reduce((sum, m) => sum + m.totalReach, 0);
  const avgScore = Math.round(
    MOCK_OPPORTUNITY_SCORES.reduce((sum, o) => sum + o.overallScore, 0) / MOCK_OPPORTUNITY_SCORES.length
  );
  const highPriorityCount = MOCK_OPPORTUNITY_SCORES.filter((o) => o.recommendation === "HIGH_PRIORITY").length;

  return (
    <div className="grid gap-4 md:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Regions</CardTitle>
          <Globe2 className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{MOCK_REGIONS.length}</div>
          <p className="text-xs text-muted-foreground">Tracked markets</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Reach</CardTitle>
          <Users className="h-4 w-4 text-blue-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatReach(totalReach)}</div>
          <p className="text-xs text-muted-foreground">Combined platform users</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Avg Opportunity</CardTitle>
          <TrendingUp className="h-4 w-4 text-green-500" />
        </CardHeader>
        <CardContent>
          <div className={`text-2xl font-bold ${getScoreColor(avgScore)}`}>{avgScore}</div>
          <p className="text-xs text-muted-foreground">Across all regions</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">High Priority</CardTitle>
          <Zap className="h-4 w-4 text-amber-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-green-500">{highPriorityCount}</div>
          <p className="text-xs text-muted-foreground">Markets to focus on</p>
        </CardContent>
      </Card>
    </div>
  );
}

type Continent = Region["continent"];

const CONTINENT_NAMES: Record<Continent, string> = {
  NORTH_AMERICA: "North America",
  SOUTH_AMERICA: "South America",
  EUROPE: "Europe",
  ASIA: "Asia",
  AFRICA: "Africa",
  OCEANIA: "Oceania",
};

export default function GlobalMapPage() {
  const continents = [...new Set(MOCK_REGIONS.map((r) => r.continent))] as Continent[];

  return (
    <div className="flex flex-col">
      <Header
        title="Global Social Map"
        description="Discover regional opportunities and track market potential across the world"
      />

      <div className="flex-1 space-y-6 p-6">
        <GlobalStatsPanel />

        <div className="grid gap-6 lg:grid-cols-4">
          <div className="lg:col-span-3">
            <Card>
              <CardHeader>
                <CardTitle>Regional Opportunities</CardTitle>
                <CardDescription>
                  Explore social media potential by region, with opportunity scores based on growth,
                  competition, and engagement metrics
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="ALL" className="w-full">
                  <TabsList className="mb-4 flex-wrap h-auto gap-1">
                    <TabsTrigger value="ALL" className="text-xs">All Regions</TabsTrigger>
                    {continents.map((continent) => (
                      <TabsTrigger key={continent} value={continent} className="text-xs">
                        {CONTINENT_NAMES[continent]}
                      </TabsTrigger>
                    ))}
                  </TabsList>

                  <TabsContent value="ALL" className="mt-0">
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {MOCK_REGIONS.map((region) => {
                        const metrics = MOCK_REGION_METRICS.find((m) => m.regionId === region.id)!;
                        const opportunity = MOCK_OPPORTUNITY_SCORES.find((o) => o.regionId === region.id)!;
                        return (
                          <RegionCard
                            key={region.id}
                            region={region}
                            metrics={metrics}
                            opportunity={opportunity}
                          />
                        );
                      })}
                    </div>
                  </TabsContent>

                  {continents.map((continent) => {
                    const regions = getRegionsByContinent(MOCK_REGIONS, continent);
                    return (
                      <TabsContent key={continent} value={continent} className="mt-0">
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                          {regions.map((region) => {
                            const metrics = MOCK_REGION_METRICS.find((m) => m.regionId === region.id)!;
                            const opportunity = MOCK_OPPORTUNITY_SCORES.find(
                              (o) => o.regionId === region.id
                            )!;
                            return (
                              <RegionCard
                                key={region.id}
                                region={region}
                                metrics={metrics}
                                opportunity={opportunity}
                              />
                            );
                          })}
                        </div>
                      </TabsContent>
                    );
                  })}
                </Tabs>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <TopOpportunitiesPanel opportunities={MOCK_OPPORTUNITY_SCORES} />

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Score Legend</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                <div className="flex items-center gap-2">
                  <div className={`h-3 w-3 rounded-full ${getScoreBgColor(80)}`} />
                  <span>70-100: High Priority</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`h-3 w-3 rounded-full ${getScoreBgColor(60)}`} />
                  <span>55-69: Medium Priority</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`h-3 w-3 rounded-full ${getScoreBgColor(45)}`} />
                  <span>40-54: Low Priority</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`h-3 w-3 rounded-full ${getScoreBgColor(30)}`} />
                  <span>0-39: Monitor</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">About Scores</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground space-y-2">
                <p>
                  <strong>Growth Potential:</strong> Based on platform user growth rates in the region.
                </p>
                <p>
                  <strong>Competition:</strong> Inverse of creator saturation — lower saturation means more opportunity.
                </p>
                <p>
                  <strong>Engagement:</strong> Average engagement rates across all platforms in the region.
                </p>
                <p>
                  <strong>Accessibility:</strong> Internet penetration and market entry barriers.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
