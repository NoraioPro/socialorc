import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { listPosts, relativeTime, tenantFor } from "@/lib/socialork/queries";
import { PostActions } from "@/components/socialork/post-actions";
import { PLATFORM_CONFIGS } from "@/types/platform";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await getAuthSession();
  if (!session?.user?.id) redirect("/login");
  const tenant = await tenantFor(session.user.id);
  if (!tenant) redirect("/onboarding");

  const { tab } = await searchParams;
  const active = tab === "approved" ? "approved" : tab === "sent-back" ? "sent-back" : "review";

  const [review, approved, sentBack] = await Promise.all([
    listPosts(tenant, ["PENDING_APPROVAL"], 40),
    listPosts(tenant, ["APPROVED"], 40),
    listPosts(tenant, ["DRAFT"], 40),
  ]);
  const rows = active === "approved" ? approved : active === "sent-back" ? sentBack.filter((p) => p.title) : review;

  const tabs = [
    { id: "review", label: "In review", count: review.length },
    { id: "approved", label: "Approved", count: approved.length },
    { id: "sent-back", label: "Drafts", count: sentBack.length },
  ];

  return (
    <div className="so-page">
      <div style={{ display: "grid", gap: 6 }}>
        <h1 className="so-h1">Approvals</h1>
        <p className="so-sub">
          Every post needs a recorded approval before it can be scheduled. Editing a post clears its
          approval — that is enforced by the server, not by this screen.
        </p>
      </div>

      <div className="so-tabs">
        {tabs.map((t) => (
          <a
            key={t.id}
            href={`/socialork/approvals?tab=${t.id}`}
            className="so-tab"
            data-active={t.id === active}
            style={{ textDecoration: "none" }}
          >
            {t.label} <span>{t.count}</span>
          </a>
        ))}
      </div>

      <section className="so-card">
        {rows.length === 0 ? (
          <div className="so-empty">
            {active === "review"
              ? "Nothing is waiting for a decision."
              : active === "approved"
                ? "No approved posts are waiting to be scheduled."
                : "No drafts yet — write one in Create."}
          </div>
        ) : (
          <div style={{ display: "grid" }}>
            {rows.map((post) => (
              <article
                key={post.id}
                style={{ display: "grid", gap: 8, padding: "14px 16px", borderBottom: "1px solid var(--line)" }}
              >
                <div className="so-row" style={{ gap: 8, flexWrap: "wrap" }}>
                  <span className="so-pill">
                    {PLATFORM_CONFIGS[post.platform]?.name ?? post.platform}
                  </span>
                  <span className="so-mono" style={{ fontSize: 11, color: "var(--text3)" }}>
                    {post.socialAccount?.platformUsername ? `@${post.socialAccount.platformUsername}` : "no account"}
                    {" · "}
                    {post.approvedAt ? `approved ${relativeTime(post.approvedAt)}` : `updated ${relativeTime(post.updatedAt)}`}
                  </span>
                  <span style={{ marginLeft: "auto" }}>
                    <PostActions id={post.id} status={post.status} compact />
                  </span>
                </div>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{post.title ?? "Untitled post"}</div>
                <div style={{ color: "var(--text2)", fontSize: 12.5, whiteSpace: "pre-wrap", maxHeight: 96, overflow: "hidden" }}>
                  {post.content.slice(0, 320)}
                  {post.content.length > 320 ? "…" : ""}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
