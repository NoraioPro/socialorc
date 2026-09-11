"use client";

import { analyzeText, type CulturalWarning } from "@/lib/cultural-intel";
import { AlertTriangle, Info } from "lucide-react";

export function CulturalWarningsBanner({
  text,
  locale,
}: {
  text: string;
  locale?: string;
}) {
  const warnings: CulturalWarning[] = analyzeText(text, locale);
  if (warnings.length === 0) return null;

  return (
    <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm space-y-2">
      <p className="font-medium text-amber-200">
        Cultural advisories (do not block scheduling — approval gate still required)
      </p>
      <ul className="space-y-1">
        {warnings.map((w) => (
          <li key={w.id} className="flex gap-2 items-start text-amber-100/90">
            {w.severity === "info" ? (
              <Info className="h-4 w-4 mt-0.5 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            )}
            <span>
              <span className="uppercase text-[10px] tracking-wide opacity-70 mr-2">
                {w.severity}
              </span>
              {w.message}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
