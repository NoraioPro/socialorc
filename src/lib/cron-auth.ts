/**
 * Whether a request may run the cron worker.
 *
 * Fails closed: with no CRON_SECRET configured nobody is authorized, so a
 * deployment that forgot the secret cannot be triggered by anyone on the internet.
 */
export function isAuthorizedCronRequest(
  authHeader: string | null,
  cronSecret: string | undefined,
): boolean {
  if (!cronSecret) return false;
  return authHeader === `Bearer ${cronSecret}`;
}
