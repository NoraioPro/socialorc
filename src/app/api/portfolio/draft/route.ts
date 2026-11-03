import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/tenancy/guard";
import { saveDraft } from "@/lib/portfolio/service";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/portfolio/draft — save the draft document.
 *
 * Two guarantees the editor depends on:
 *  - the document passes `parseDocument()` before it is stored (nothing invalid
 *    can ever reach the database or the renderer);
 *  - the write is compare-and-set on `documentVersion`, so a stale tab gets 409
 *    with the current version instead of silently overwriting newer work.
 */
export async function PATCH(req: NextRequest) {
  const guard = await requirePermission("portfolio:edit");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const body = (await req.json().catch(() => ({}))) as {
    document?: unknown;
    documentVersion?: unknown;
  };

  const version = typeof body.documentVersion === "number" ? body.documentVersion : Number.NaN;
  if (!Number.isInteger(version) || version < 1) {
    return NextResponse.json(
      { error: "documentVersion is required (integer ≥ 1).", code: "invalid_version" },
      { status: 400 },
    );
  }

  const result = await saveDraft(guard.userId, body.document, version);

  if (result.ok) {
    return NextResponse.json({ ok: true, documentVersion: result.documentVersion });
  }
  switch (result.code) {
    case "invalid":
      return NextResponse.json(
        { error: "The document is not valid.", code: "invalid_document", issues: result.issues },
        { status: 422 },
      );
    case "conflict":
      return NextResponse.json(
        {
          error: "This portfolio was changed in another tab.",
          code: "version_conflict",
          documentVersion: result.documentVersion,
        },
        { status: 409 },
      );
    case "missing":
      return NextResponse.json({ error: "No portfolio yet.", code: "missing" }, { status: 404 });
  }
}
