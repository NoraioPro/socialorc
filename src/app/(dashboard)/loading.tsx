/**
 * Instant feedback on navigation.
 *
 * Every dashboard page is a server component that queries the database before
 * it can render, so without a loading boundary a click sat on the old screen
 * for the length of that query and read as a frozen app. This renders the
 * moment the route changes.
 */
export default function DashboardLoading() {
  return (
    <div className="space-y-4 p-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="h-8 w-48 animate-pulse rounded-lg bg-muted" />
      <div className="h-4 w-72 animate-pulse rounded bg-muted" />
      <div className="grid gap-4 pt-4 md:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-44 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    </div>
  );
}
