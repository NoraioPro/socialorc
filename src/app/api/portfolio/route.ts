import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/tenancy/guard";
import { createPortfolio, getPortfolio, toDto, updateHandle } from "@/lib/portfolio/service";
import { handleProblem } from "@/lib/portfolio/blank";

export const dynamic = "force-dynamic";

/**
 * GET /api/portfolio — the caller's portfolio, or null.
 *
 * Read-only by design: a GET that creates a row breaks prefetching, caching and
 * CSRF expectations, and makes "did they create one?" unanswerable. Creation is
 * an explicit POST below.
 */
export async function GET() {
  const guard = await requirePermission("portfolio:edit");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const row = await getPortfolio(guard.userId);
  return NextResponse.json({ portfolio: row ? toDto(row) : null });
}

/**
 * POST /api/portfolio — create the caller's portfolio (blank canvas by default).
 * A second portfolio is refused: one user, one portfolio.
 */
export async function POST(req: NextRequest) {
  const guard = await requirePermission("portfolio:edit");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const body = (await req.json().catch(() => ({}))) as { handle?: string };
  const created = await createPortfolio(guard.userId, { handle: body.handle });

  if (!created.ok) {
    const status = created.code === "exists" || created.code === "handle_taken" ? 409 : 400;
    return NextResponse.json({ error: created.message, code: created.code }, { status });
  }
  return NextResponse.json({ portfolio: toDto(created.portfolio) }, { status: 201 });
}

/** PATCH /api/portfolio — change the public handle. */
export async function PATCH(req: NextRequest) {
  const guard = await requirePermission("portfolio:edit");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const body = (await req.json().catch(() => ({}))) as { handle?: unknown };
  const problem = handleProblem(body.handle);
  if (problem) return NextResponse.json({ error: problem, code: "invalid_handle" }, { status: 400 });

  const result = await updateHandle(guard.userId, body.handle as string);
  if (!result.ok) {
    const status = result.code === "missing" ? 404 : result.code === "handle_taken" ? 409 : 400;
    return NextResponse.json({ error: result.message, code: result.code }, { status });
  }
  return NextResponse.json({ portfolio: toDto(result.portfolio) });
}
