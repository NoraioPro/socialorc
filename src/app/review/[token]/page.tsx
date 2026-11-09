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
        <p style={{ color: "var(--text2)", fontSize: 13.5 }}>
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

  const wsName = post.workspace?.name ?? "SocialOrk";
  const stateLabel = post.status === "APPROVED" ? "Approved" : post.status === "DRAFT" ? "Changes requested" : "Awaiting your decision";
  const stateTone = post.status === "APPROVED" ? ["#E3F4E8", "#1C6B38"] : post.status === "DRAFT" ? ["#FBE9E7", "#B3261E"] : ["#EFEEE9", "#55555F"];

  return (
    <div style={{ minHeight: "100dvh", background: "#F6F5F1", color: "#16161A", colorScheme: "light",
      ["--text" as string]: "#16161A", ["--text2" as string]: "#55555F", ["--text3" as string]: "#80808A",
      ["--line" as string]: "rgba(0,0,0,.09)", ["--line2" as string]: "rgba(0,0,0,.16)",
      ["--panel" as string]: "#FFFFFF", ["--panel2" as string]: "#EFEEE9", ["--bg" as string]: "#F6F5F1" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 24px", background: "#fff", borderBottom: "1px solid var(--line)", flexWrap: "wrap" }}>
      <span aria-hidden style={{ width: 28, height: 28, borderRadius: 8, background: "oklch(0.8 0.17 150)", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 12, color: "#06140B" }}>
        {wsName.slice(0, 1).toUpperCase()}
      </span>
      <span style={{ fontWeight: 600 }}>{wsName}</span>
      <span style={{ fontSize: 12.5, color: "var(--text3)" }}>· review requested</span>
      <span style={{ flex: 1 }} />
      <span className="so-mono" style={{ fontSize: 11, color: "var(--text3)" }}>SIGNED LINK · VALID 72 H</span>
    </div>
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "32px 18px 60px", display: "grid", gap: 16 }}>
      <header>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em" }}>Review this post</h1>
        <p style={{ margin: "6px 0 0", color: "var(--text2)" }}>
          No account needed. Approve the post, or say what should change. Your answer goes straight to the team.
        </p>
      </header>

      <article style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 14, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", borderBottom: "1px solid var(--line)" }}>
          <span style={{ fontWeight: 600 }}>{platformName}</span>
          {post.scheduledFor ? <span style={{ fontSize: 12, color: "var(--text3)" }}>· scheduled {new Date(post.scheduledFor).toLocaleString("en-GB")}</span> : null}
          <span style={{ flex: 1 }} />
          <span style={{ height: 22, padding: "0 8px", borderRadius: 6, background: stateTone[0], color: stateTone[1], fontSize: 11.5, fontWeight: 600, display: "flex", alignItems: "center" }}>{stateLabel}</span>
        </div>
        <div style={{ padding: 16, display: "grid", gap: 12 }}>
        <div style={{ fontWeight: 600, fontSize: 16 }}>{post.title ?? "Untitled post"}</div>
        <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6, color: "var(--text)" }}>{post.content}</div>
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
        </div>
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
    </div>
  );
}
