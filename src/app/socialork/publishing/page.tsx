import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { formatWhen, getPublishing, relativeTime, tenantFor } from "@/lib/socialork/queries";
import { PostActions } from "@/components/socialork/post-actions";
import { PublishCalendar } from "@/components/socialork/publish-calendar";
import { PublishingTabs } from "@/components/socialork/publishing-tabs";
import { PublishQueue, type QueueRow } from "@/components/socialork/publish-queue";
import { PLATFORM_CONFIGS } from "@/types/platform";

export const dynamic = "force-dynamic";

export default async function PublishingPage() {
  const session = await getAuthSession();
  if (!session?.user?.id) redirect("/login");
  const tenant = await tenantFor(session.user.id);
  if (!tenant) redirect("/onboarding");

  const { upcoming, failed, published, jobs, approved } = await getPublishing(tenant);

  const calendarItems = [
    ...upcoming.map((p) => ({ id: p.id, title: p.title, platform: p.platform, when: (p.scheduledFor ?? p.createdAt).toISOString() })),
  ];
  const trayItems = approved.map((p) => ({ id: p.id, title: p.title, platform: p.platform, when: p.createdAt.toISOString() }));

  const channel = (p: { platform: keyof typeof PLATFORM_CONFIGS }) => PLATFORM_CONFIGS[p.platform]?.name ?? p.platform;
  const queueRows: QueueRow[] = [
    ...upcoming.map((p) => ({
      id: p.id, title: p.title ?? "Untitled post", channel: channel(p), status: p.status,
      when: formatWhen(p.scheduledFor), attempts: `${p.retryCount}/3`,
      detail: p.status === "PUBLISHING" ? "Sending now" : "Waiting for its time", url: null,
    })),
    ...failed.map((p) => ({
      id: p.id, title: p.title ?? "Untitled post", channel: channel(p), status: p.status,
      when: formatWhen(p.scheduledFor), attempts: `${p.retryCount}/3`,
      detail: `${p.errorMessage ?? "The platform rejected the request."} · updated ${relativeTime(p.updatedAt)}`, url: null,
    })),
    ...published.map((p) => ({
      id: p.id, title: p.title ?? p.content.slice(0, 60), channel: channel(p), status: p.status,
      when: formatWhen(p.scheduledFor), attempts: `${p.retryCount}/3`,
      detail: `Published ${relativeTime(p.publishedAt)}`, url: p.platformPostUrl,
    })),
  ];

  return (
    <div className="so-page" data-wide="true">
      <PublishingTabs
        failed={failed.length}
        upcoming={upcoming.length}
        published={published.length}
        week={
          <>
      <PublishCalendar scheduled={calendarItems} approved={trayItems} />

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

          </>
        }
        queue={
          <>
            <PublishQueue rows={queueRows} />
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

          </>
        }
      />
    </div>
  );
}
