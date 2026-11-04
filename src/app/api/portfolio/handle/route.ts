import { NextResponse, type NextRequest } from "next/server";
import { requirePermission } from "@/lib/tenancy/guard";
import { ownPortfolio, portfolioCaller } from "@/lib/portfolio/route-helpers";
import { handleMessage, handleStatus, normaliseHandle, suggestHandles } from "@/lib/portfolio/server";

/** Is this address free? Suggests alternatives when it isn't. */
export async function GET(request: NextRequest) {
  const caller = portfolioCaller(await requirePermission("portfolio:edit"));
  if (!caller.ok) return caller.response;
  const handle = normaliseHandle(request.nextUrl.searchParams.get("h") ?? "");
  const own = await ownPortfolio(caller.userId);
  const status = await handleStatus(handle, own?.id);
  return NextResponse.json({ handle, status, message: handleMessage(status), suggestions: status === "ok" ? [] : await suggestHandles(handle) });
}
