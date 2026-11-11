/** App-wide English / Arabic. The choice lives in the `so-lang` cookie (read on the server, so first paint is right). */
export type Lang = "en" | "ar";
export const LANG_COOKIE = "so-lang";

const AR: Record<string, string> = {
  Overview: "نظرة عامة", "Market Intel": "ذكاء السوق", Create: "إنشاء", "AI Studio": "استوديو الذكاء", Autopilot: "الطيار الآلي",
  Automations: "الأتمتة", Drafts: "المسودات", Approvals: "الموافقات", Publishing: "النشر", Inbox: "صندوق الوارد", Timeline: "الخط الزمني",
  Insights: "التحليلات", Workspace: "مساحة العمل", Brains: "العقول", Media: "الوسائط", Portfolio: "المعرض", Workspaces: "مساحات العمل",
  Team: "الفريق", Settings: "الإعدادات", "New post": "منشور جديد", Search: "بحث", "View as": "عرض كـ", Admin: "مدير", Manager: "مشرف",
  Editor: "محرر", "Sign out": "تسجيل الخروج", Menu: "القائمة", "Quick navigation": "تنقل سريع",
  "Quick review": "مراجعة سريعة", "Review queue": "قائمة المراجعة", "Audit trail": "سجل التدقيق",
  "Get your workspace ready": "جهّز مساحة عملك", Language: "اللغة",
};

export const tr = (lang: Lang, s: string) => (lang === "ar" ? AR[s] ?? s : s);
