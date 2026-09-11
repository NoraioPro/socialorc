import { notFound, redirect } from "next/navigation";
import { Header } from "@/components/dashboard/header";
import { getAuthSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { DraftEditForm } from "@/components/posts/draft-edit-form";

export default async function DraftEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getAuthSession();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;
  const post = await prisma.post.findFirst({
    where: { id, userId: session.user.id },
    include: {
      mediaAssets: true,
    },
  });

  if (!post) notFound();

  return (
    <div className="flex flex-col">
      <Header
        title="Edit draft"
        description="Update content with live per-platform remaining character counts"
      />
      <div className="flex-1 p-6">
        <DraftEditForm
          postId={post.id}
          initialContent={post.content}
          platform={post.platform}
          hasMedia={post.mediaAssets.length > 0}
          status={post.status}
        />
      </div>
    </div>
  );
}
