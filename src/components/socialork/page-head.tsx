import type { ReactNode } from "react";
import { getLang } from "@/lib/socialork/lang";
import { tr } from "@/lib/socialork/i18n";

/** Page title block; the title is translated when the app language is Arabic. */
export async function PageHead({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  const lang = await getLang();
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
      <div>
        <h1 className="so-h1">{tr(lang, title)}</h1>
        <p style={{ margin: "4px 0 0", color: "var(--text2)", maxWidth: 660, fontSize: 13 }}>{children}</p>
      </div>
      {actions ? <div style={{ display: "flex", gap: 8 }}>{actions}</div> : null}
    </div>
  );
}
