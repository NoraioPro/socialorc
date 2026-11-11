import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { relativeTime, tenantFor } from "@/lib/socialork/queries";
import { tenantCan } from "@/lib/tenancy/guard";
import { MediaUpload } from "@/components/socialork/media-upload";
import { GenerateImage, MediaGrid } from "@/components/socialork/media-grid";
import { PageHead } from "@/components/socialork/page-head";

export const dynamic = "force-dynamic";

function size(n: number) {
  return n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

export default async function MediaPage() {
  const session = await getAuthSession();
  if (!session?.user?.id) redirect("/login");
  const tenant = await tenantFor(session.user.id);
  if (!tenant) redirect("/onboarding");

  const [assets, ws] = await Promise.all([
    prisma.mediaAsset.findMany({
      where: { workspaceId: tenant.workspaceId },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, filename: true, mimeType: true, size: true, url: true, width: true, height: true, duration: true, createdAt: true, altText: true, _count: { select: { posts: true } } },
    }),
    prisma.workspace.findUnique({ where: { id: tenant.workspaceId }, select: { name: true } }),
  ]);

  return (
    <div className="so-page">
      <PageHead title="Media" actions={tenantCan(tenant, "media:upload") ? <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}><GenerateImage /><MediaUpload /></div> : null}>
        Images and videos for {ws?.name ?? "your workspace"}. Attach them to a post from Create.
      </PageHead>

      {assets.length === 0 ? (
        <section style={{ border: "1px dashed var(--line2)", borderRadius: 12, padding: "40px 20px", textAlign: "center", color: "var(--text3)" }}>
          No media yet. Upload images or MP4 videos, then attach them from Create.
        </section>
      ) : (
        <MediaGrid canEdit={tenantCan(tenant, "media:upload")} items={assets.map((a) => ({
          id: a.id, filename: a.filename, mimeType: a.mimeType, url: a.url, altText: a.altText, usedIn: a._count.posts,
          dims: a.width && a.height ? `${a.width}x${a.height}` : a.mimeType.startsWith("video/") && a.duration ? `${a.duration}s` : a.mimeType.split("/")[1],
          meta: `${size(a.size)} · ${relativeTime(a.createdAt)}`,
        }))} />
      )}
    </div>
  );
}
