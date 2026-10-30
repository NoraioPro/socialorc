import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { formatWhen, getPublishing, relativeTime, tenantFor } from "@/lib/socialork/queries";
import { PostActions } from "@/components/socialork/post-actions";
import { PLATFORM_CONFIGS } from "@/types/platform";

export const dynamic = "force-dynamic";

export default async function PublishingPage() {
  const session = await getAuthSession();
  if (!session?.user?.id) redirect("/login");
  const tenant = await tenantFor(session.user.id);
  if (!tenant) redirect("/onboarding");

  const { upcoming, failed, published, jobs } = await getPublishing(tenant);

  return (
    <div className="so-page">
      <div className="so-spread">
        <div style={{ display: "grid", gap: 6 }}>
          <h1 className="so-h1">Publishing</h1>
          <p className="so-sub">
            Every scheduled post across all channels, and the queue that sends them. A failed send is
            retried only when the platform error is retryable, and it always says why in plain words.
          </p>
        </div>
        <div className="so-row" style={{ gap: 8 }}>
          <span className="so-pill" data-tone="scheduled">{upcoming.length} upcoming</span>
          <span className="so-pill" data-tone={failed.length ? "failed" : "published"}>{failed.length} failed</span>
          <span className="so-pill">{published.length} published</span>
        </div>
      </div>

      <section className="so-card">
        <div className="so-card-pad" style={{ borderBottom: "1px solid var(--line)" }}>
          <div className="so-stat-label">Upcoming</div>
        </div>
        {upcoming.length === 0 ? (
          <div className="so-empty">
            Nothing is scheduled. Approved posts can be scheduled from <a href="/socialork/approvals">Approvals</a>.
          </div>
        ) : (
          <table className="so-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Post</th>
                <th>Channel</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {upcoming.map((post) => (
                <tr key={post.id}>
                  <td className="so-mono" style={{ whiteSpace: "nowrap", color: "var(--text2)" }}>
                    {formatWhen(post.scheduledFor)}
                  </td>
                  <td style={{ maxWidth: 380 }}>
                    <div style={{ fontWeight: 600 }}>{post.title ?? "Untitled post"}</div>
                    <div style={{ color: "var(--text3)", fontSize: 11.5 }}>
                      {post.content.slice(0, 90)}{post.content.length > 90 ? "…" : ""}
                    </div>
                  </td>
                  <td>{PLATFORM_CONFIGS[post.platform]?.name ?? post.platform}</td>
                  <td>
                    <span className="so-pill" data-tone={post.status === "PUBLISHING" ? "publishing" : "scheduled"}>
                      {post.status === "PUBLISHING" ? "Publishing…" : "Scheduled"}
                    </span>
                  </td>
                  <td>
                    <PostActions id={post.id} status={post.status} compact />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {failed.length > 0 ? (
        <section className="so-card">
          <div className="so-card-pad" style={{ borderBottom: "1px solid var(--line)" }}>
            <div className="so-stat-label">Failed — retry is safe when the platform error is retryable</div>
          </div>
          <table className="so-table">
            <thead>
              <tr>
                <th>Post</th>
                <th>Channel</th>
                <th>Attempts</th>
                <th>Detail</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {failed.map((post) => (
                <tr key={post.id}>
                  <td style={{ maxWidth: 320 }}>
                    <div style={{ fontWeight: 600 }}>{post.title ?? "Untitled post"}</div>
                    <div style={{ color: "var(--text3)", fontSize: 11.5 }}>
                      scheduled {formatWhen(post.scheduledFor)} · updated {relativeTime(post.updatedAt)}
                    </div>
                  </td>
                  <td>{PLATFORM_CONFIGS[post.platform]?.name ?? post.platform}</td>
                  <td className="so-mono">{post.retryCount}/3</td>
                  <td style={{ maxWidth: 380, color: "var(--text2)" }}>
                    {post.errorMessage ?? "The platform rejected the request."}
                  </td>
                  <td>
                    <PostActions id={post.id} status={post.status} compact />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <section className="so-card">
        <div className="so-card-pad" style={{ borderBottom: "1px solid var(--line)" }}>
          <div className="so-stat-label">Recent queue jobs</div>
        </div>
        {jobs.length === 0 ? (
          <div className="so-empty">No publishing jobs yet.</div>
        ) : (
          <table className="so-table">
            <thead>
              <tr>
                <th>Created</th>
                <th>Platform</th>
                <th>Status</th>
                <th>Attempts</th>
                <th>Error code</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td className="so-mono" style={{ whiteSpace: "nowrap", color: "var(--text2)" }}>
                    {relativeTime(job.createdAt)}
                  </td>
                  <td>{PLATFORM_CONFIGS[job.platform]?.name ?? job.platform}</td>
                  <td>
                    <span className="so-pill" data-tone={job.status === "failed" ? "failed" : job.status === "published" ? "approved" : "scheduled"}>
                      {job.status}
                    </span>
                  </td>
                  <td className="so-mono">{job.attemptCount}</td>
                  <td className="so-mono" style={{ color: "var(--text3)" }}>
                    {job.lastErrorCode ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {published.length > 0 ? (
        <section className="so-card">
          <div className="so-card-pad" style={{ borderBottom: "1px solid var(--line)" }}>
            <div className="so-stat-label">Recently published</div>
          </div>
          <div style={{ display: "grid" }}>
            {published.map((post) => (
              <div key={post.id} className="so-row" style={{ padding: "11px 16px", borderBottom: "1px solid var(--line)", gap: 10 }}>
                <span className="so-pill">{PLATFORM_CONFIGS[post.platform]?.name ?? post.platform}</span>
                <span style={{ fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {post.title ?? post.content.slice(0, 60)}
                </span>
                <span className="so-mono" style={{ marginLeft: "auto", fontSize: 11, color: "var(--text3)" }}>
                  {relativeTime(post.publishedAt)}
                </span>
                {post.platformPostUrl ? (
                  <a href={post.platformPostUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
                    Open
                  </a>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
