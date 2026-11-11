import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/tenancy/guard";
import { AINotConfiguredError } from "@/lib/ai";
import { addCompetitor, askAnalyst, listCompetitors, removeCompetitor } from "@/lib/socialork/market-intel";
import { enforceRateLimit } from "@/lib/rate-limit-guard";

/** Body: { action: "add", name, handle?, note? } | { action: "remove", id } | { action: "ask", question } */
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null) as { action?: string; name?: string; handle?: string; note?: string; id?: string; question?: string } | null;
  if (b?.action === "ask") {
    const g = await requireWorkspace("posts:create");
    if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
    if (!b.question?.trim()) return NextResponse.json({ error: "Ask a question" }, { status: 400 });
    const limited = await enforceRateLimit("ai", `user:${g.userId}`);
    if (limited) return limited;
    try {
      return NextResponse.json({ answer: await askAnalyst(g.workspaceId, g.userId, b.question) });
    } catch (e) {
      if (e instanceof AINotConfiguredError) return NextResponse.json({ error: "Add an AI key under Settings to use the analyst. Until then it will not guess." }, { status: 503 });
      console.error("market-intel.ask", e);
      return NextResponse.json({ error: "The analyst could not answer. Check your AI key under Settings." }, { status: 502 });
    }
  }
  const g = await requireWorkspace("brains:manage");
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  if (b?.action === "add") {
    if (!b.name?.trim()) return NextResponse.json({ error: "Give the competitor a name" }, { status: 400 });
    try { await addCompetitor(g.workspaceId, { name: b.name.trim(), handle: b.handle?.trim() ?? "", note: b.note?.trim() ?? "" }); }
    catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
  } else if (b?.action === "remove" && b.id) await removeCompetitor(g.workspaceId, b.id);
  else return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  return NextResponse.json({ competitors: await listCompetitors(g.workspaceId) });
}
