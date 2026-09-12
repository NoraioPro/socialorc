"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { localizeVariants, type LocaleVariant } from "@/lib/localization";
import { Languages } from "lucide-react";

export function LocaleVariantsPanel({ text }: { text: string }) {
  const result = localizeVariants(text);
  if (!text.trim()) return null;

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Languages className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Locale variants</CardTitle>
          </div>
          <Badge variant="outline" className="text-xs">
            mock · no translate API
          </Badge>
        </div>
        <CardDescription>
          Stub localization for create flow. Phrase-bank adaptation only — not live translation.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        {result.variants.map((v: LocaleVariant) => (
          <div key={v.locale} className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">
                {v.label} ({v.locale})
              </p>
              <Badge variant="secondary" className="text-[10px] uppercase">
                {v.dir}
              </Badge>
            </div>
            <p className="text-sm whitespace-pre-wrap" dir={v.dir}>
              {v.text}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
