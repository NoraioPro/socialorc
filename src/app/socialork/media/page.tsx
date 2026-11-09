import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { relativeTime, tenantFor } from "@/lib/socialork/queries";
import { tenantCan } from "@/lib/tenancy/guard";
import { MediaUpload } from "@/components/socialork/media-upload";
import { PageHead, card } from "@/components/socialork/design-bits";

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
      select: { id: true, filename: true, mimeType: true, size: true, url: true, width: true, height: true, duration: true, createdAt: true },
    }),
    prisma.workspace.findUnique({ where: { id: tenant.workspaceId }, select: { name: true } }),
  ]);

  return (
    <div className="so-page">
      <PageHead title="Media" actions={tenantCan(tenant, "media:upload") ? <MediaUpload /> : null}>
        Images and videos for {ws?.name ?? "your workspace"}. Attach them to a post from Create.
      </PageHead>

      {assets.length === 0 ? (
        <section style={{ border: "1px dashed var(--line2)", borderRadius: 12, padding: "40px 20px", textAlign: "center", color: "var(--text3)" }}>
          No media yet. Upload images or MP4 videos, then attach them from Create.
        </section>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 12 }}>
          {assets.map((a) => {
            const video = a.mimeType.startsWith("video/");
            const dims = a.width && a.height ? `${a.width}x${a.height}` : video && a.duration ? `${a.duration}s` : a.mimeType.split("/")[1];
            return (
              <section key={a.id} style={{ ...card, display: "flex", flexDirection: "column" }}>
                <div style={{ aspectRatio: "4 / 3", background: "var(--bg)" }}>
                  {video ? (
                    <video src={a.url} muted preload="metadata" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.url} alt={a.filename} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  )}
                </div>
                <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={a.filename}>{a.filename}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text3)" }}>{dims} · {size(a.size)} · {relativeTime(a.createdAt)}</div>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
