/**
 * The workspace a member is currently looking at.
 *
 * A user can belong to several workspaces (their own plus any team that invited
 * them). The choice lives in an httpOnly cookie and is validated against their
 * memberships on every request — a cookie naming a workspace they are not in is
 * ignored, never trusted.
 */
import { cookies } from "next/headers";

export const ACTIVE_WORKSPACE_COOKIE = "so_workspace";

export async function readActiveWorkspaceId(): Promise<string | null> {
  try {
    const jar = await cookies();
    const value = jar.get(ACTIVE_WORKSPACE_COOKIE)?.value;
    return value && value.length < 64 ? value : null;
  } catch {
    // Outside a request scope (script, test): fall back to the default workspace.
    return null;
  }
}

export const ACTIVE_WORKSPACE_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
};
