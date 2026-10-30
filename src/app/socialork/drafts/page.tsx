import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { listPosts, relativeTime, tenantFor } from "@/lib/socialork/queries";
import { PostActions } from "@/components/socialork/post-actions";
import { PLATFORM_CONFIGS } from "@/types/platform";

export const dynamic = "force-dynamic";

export default async function DraftsPage() {
  const session = await getAuthSession();
  if (!session?.user?.id) redirect("/login");
  const tenant = await tenantFor(session.user.id);
  if (!tenant) redirect("/onboarding");

  const drafts = await listPosts(tenant, ["DRAFT"], 60);

  return (
    <div className="so-page">
      <div className="so-spread">
        <div style={{ display: "grid", gap: 6 }}>
          <h1 className="so-h1">Drafts</h1>
          <p className="so-sub">
            Nothing here is visible to anyone but this workspace. Submit a draft for review when it
            is ready to be decided on.
          </p>
        </div>
        <a href="/socialork/create" className="so-btn" data-variant="primary" style={{ textDecoration: "none" }}>
          New post
        </a>
      </div>

      <section className="so-card">
        {drafts.length === 0 ? (
          <div className="so-empty">
            No drafts yet. <a href="/socialork/create">Write the first one</a>.
          </div>
        ) : (
          <div className="so-list" style={{ display: "grid" }}>
            {drafts.map((post) => (
              <article
                key={post.id}
                style={{ display: "grid", gap: 8, padding: "14px 16px", borderBottom: "1px solid var(--line)" }}
              >
                <div className="so-row" style={{ gap: 8, flexWrap: "wrap" }}>
                  <span className="so-pill">{PLATFORM_CONFIGS[post.platform]?.name ?? post.platform}</span>
                  <span className="so-mono" style={{ fontSize: 11, color: "var(--text3)" }}>
                    edited {relativeTime(post.updatedAt)}
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
