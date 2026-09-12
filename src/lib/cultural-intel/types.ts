export type CulturalSeverity = "info" | "warn" | "block-advisory";

export interface CulturalWarning {
  id: string;
  severity: CulturalSeverity;
  locale?: string;
  message: string;
  ruleId: string;
}
