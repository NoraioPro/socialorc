import { notFound, redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { tenantFor } from "@/lib/socialork/queries";
import { DraftEditor } from "@/components/socialork/draft-editor";
import { PLATFORM_CONFIGS } from "@/types/platform";

export const dynamic = "force-dynamic";

export default async function DraftEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getAuthSession();
  if (!session?.user?.id) redirect("/login");
  const tenant = await tenantFor(session.user.id);
  if (!tenant) redirect("/onboarding");

  const post = await prisma.post.findFirst({
    where: { id, workspaceId: tenant.workspaceId },
    select: {
      id: true, title: true, content: true, platform: true, status: true,
      mediaAssets: {
        orderBy: { order: "asc" },
        select: { mediaAsset: { select: { id: true, url: true, mimeType: true, filename: true } } },
      },
    },
  });

  if (!post) notFound();

  return (
    <div className="so-page">
      <div className="so-spread">
        <div style={{ display: "grid", gap: 6 }}>
          <h1 className="so-h1">{post.title ?? "Untitled post"}</h1>
          <p className="so-sub">
            Edit the draft, attach files, then submit it for review. Saving an edit clears any approval,
            which is why this screen cannot publish anything.
          </p>
        </div>
        <span className="so-pill">{PLATFORM_CONFIGS[post.platform]?.name ?? post.platform}</span>
      </div>

      <DraftEditor
        id={post.id}
        initialTitle={post.title ?? ""}
        initialContent={post.content}
        platform={post.platform}
        status={post.status}
        initialMedia={post.mediaAssets.map((m) => ({
          id: m.mediaAsset.id,
          url: m.mediaAsset.url,
          mimeType: m.mediaAsset.mimeType,
          filename: m.mediaAsset.filename,
        }))}
      />
    </div>
  );
}
