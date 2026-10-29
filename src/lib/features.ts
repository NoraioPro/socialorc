/**
 * Team collaboration (invitations, role changes, the Team and Permissions
 * panels, the workspace Social Timeline) is switched off for the single-user
 * MVP. It is off unless NEXT_PUBLIC_TEAMS_ENABLED=true.
 *
 * The flag is NEXT_PUBLIC_ so the same value drives the UI (which hides the
 * controls) and the API (which refuses the requests): hiding a button while the
 * endpoint still answers would leave the feature reachable. Per-workspace data
 * isolation does NOT depend on this flag; it is always enforced.
 *
 * `process.env.NEXT_PUBLIC_TEAMS_ENABLED` is spelled out literally so Next can
 * inline it into client bundles.
 */
export function teamsEnabled(value: string | undefined = process.env.NEXT_PUBLIC_TEAMS_ENABLED): boolean {
  return (value ?? "").trim().toLowerCase() === "true";
}

/** Same body as a missing route, so a disabled feature does not advertise itself. */
export function teamsDisabledResponse(): Response {
  // Plain Response (not NextResponse) so this module stays importable from client components.
  return Response.json({ error: "Not found" }, { status: 404 });
}
