import prisma from "@/lib/prisma";
import { verifyReviewToken } from "@/lib/review-link";
import { ReviewDecision } from "@/components/socialork/review-decision";
import { PLATFORM_CONFIGS } from "@/types/platform";

export const dynamic = "force-dynamic";

/**
 * The public side of a signed review link: no account, no session. The token is
 * the authorisation, so the page renders exactly one post and nothing else.
 */
export default async function ReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const verified = verifyReviewToken(token);

  if (!verified) {
    return (
      <main style={{ maxWidth: 640, margin: "0 auto", padding: "72px 24px", color: "var(--text)" }}>
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>This review link is invalid or has expired</h1>
        <p style={{ color: "#a6a6b0", fontSize: 13.5 }}>
          Links are valid for 72 hours. Ask the team to send a fresh one.
        </p>
      </main>
    );
  }

  const post = await prisma.post.findUnique({
    where: { id: verified.postId },
    select: {
      id: true, title: true, content: true, platform: true, status: true,
      scheduledFor: true, rejectionReason: true,
      mediaAssets: { orderBy: { order: "asc" }, select: { mediaAsset: { select: { id: true, url: true, mimeType: true, filename: true } } } },
      workspace: { select: { name: true } },
    },
  });

  if (!post) {
    return (
      <main style={{ maxWidth: 640, margin: "0 auto", padding: "72px 24px", color: "var(--text)" }}>
        <h1 style={{ fontSize: 22 }}>That post no longer exists</h1>
      </main>
    );
  }

  const platformName = PLATFORM_CONFIGS[post.platform]?.name ?? post.platform;
  const open = ["PENDING_APPROVAL", "APPROVED"].includes(post.status);

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px 72px", display: "grid", gap: 16 }}>
      <header style={{ display: "grid", gap: 6 }}>
        <span className="so-mono" style={{ fontSize: 11, letterSpacing: "0.16em", color: "var(--accent)" }}>
          {post.workspace?.name?.toUpperCase() ?? "SOCIALORK"} · REVIEW
        </span>
        <h1 style={{ margin: 0, fontSize: 26, letterSpacing: "-0.02em" }}>{post.title ?? "Untitled post"}</h1>
        <span className="so-mono" style={{ fontSize: 11.5, color: "var(--text3)" }}>
          {platformName} · {post.status === "APPROVED" ? "approved" : post.status === "DRAFT" ? "changes requested" : "awaiting your decision"}
          {post.scheduledFor ? ` · scheduled ${new Date(post.scheduledFor).toLocaleString("en-GB")}` : ""}
        </span>
      </header>

      <article className="so-card so-card-pad" style={{ display: "grid", gap: 12 }}>
        <div style={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.65, color: "var(--text)" }}>{post.content}</div>
        {post.mediaAssets.length > 0 ? (
          <div className="so-row" style={{ gap: 8, flexWrap: "wrap" }}>
            {post.mediaAssets.map(({ mediaAsset }) =>
              mediaAsset.mimeType.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={mediaAsset.id} src={mediaAsset.url} alt={mediaAsset.filename}
                  style={{ maxWidth: 220, borderRadius: 10, border: "1px solid var(--line2)" }} />
              ) : (
                <span key={mediaAsset.id} className="so-pill">{mediaAsset.filename}</span>
              ),
            )}
          </div>
        ) : null}
      </article>

      {post.rejectionReason ? (
        <div className="so-frame" style={{ fontSize: 12.5 }}>
          <b>Changes requested:</b> {post.rejectionReason}
        </div>
      ) : null}

      {open ? (
        <ReviewDecision token={token} />
      ) : (
        <div className="so-frame">
          This post is no longer open for review. Ask the team to send a new link if it should be
          looked at again.
        </div>
      )}

      <footer className="so-mono" style={{ fontSize: 10.5, color: "var(--text3)" }}>
        Private link · valid for 72 hours · no account needed. Every decision is recorded with the
        time and the address it came from.
      </footer>
    </main>
  );
}
