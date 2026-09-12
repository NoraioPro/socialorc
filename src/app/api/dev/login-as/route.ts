import { NextRequest, NextResponse } from "next/server";
import { ROLES, isRole } from "@/lib/roles";
import { isDevRoleLoginEnabled } from "@/lib/dev-login";

/**
 * Dev-only, script-friendly role login.
 *
 * GET /api/dev/login-as?role=ADMIN&next=/dashboard
 *
 * Serves a tiny page that performs the normal NextAuth credentials POST with
 * `devRole` (so cookies are written by the browser exactly as the login form
 * does) and then navigates to `next`. Used by headless screenshots and smoke
 * checks. Returns 404 whenever role login is disabled.
 */
export async function GET(req: NextRequest) {
  if (!isDevRoleLoginEnabled()) {
    return new NextResponse("Not found", { status: 404 });
  }

  const roleParam = req.nextUrl.searchParams.get("role");
  if (!isRole(roleParam)) {
    return NextResponse.json(
      {
        error: `role must be one of: ${ROLES.join(", ")}`,
      },
      { status: 400 }
    );
  }

  const rawNext = req.nextUrl.searchParams.get("next") || "/dashboard";
  // Only same-origin paths: an open redirect here would be a real bug.
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/dashboard";

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Dev role login — ${roleParam}</title></head>
<body style="font:14px/1.5 system-ui,sans-serif;padding:2rem">
<p>Signing in as <strong>${roleParam}</strong>…</p>
<pre id="out"></pre>
<script>
(async () => {
  const out = document.getElementById("out");
  try {
    const csrf = await (await fetch("/api/auth/csrf", { credentials: "same-origin" })).json();
    const body = new URLSearchParams({
      csrfToken: csrf.csrfToken,
      devRole: ${JSON.stringify(roleParam)},
      callbackUrl: ${JSON.stringify(next)},
      json: "true",
    });
    const res = await fetch("/api/auth/callback/credentials", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      credentials: "same-origin",
    });
    const data = await res.json().catch(() => ({}));
    out.textContent = JSON.stringify({ status: res.status, data }, null, 2);
    const session = await (await fetch("/api/auth/session", { credentials: "same-origin" })).json();
    out.textContent += "\\n" + JSON.stringify(session, null, 2);
    if (session && session.user) {
      location.replace(${JSON.stringify(next)});
    } else {
      out.textContent += "\\nrole login FAILED — check ALLOW_DEV_ROLE_LOGIN and the server log";
    }
  } catch (err) {
    out.textContent = "error: " + (err && err.message ? err.message : String(err));
  }
})();
</script>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

