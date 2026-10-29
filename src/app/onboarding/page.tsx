import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { needsOnboarding } from "@/lib/onboarding";
import { teamsEnabled } from "@/lib/features";
import { OnboardingForm } from "./onboarding-form";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const session = await getAuthSession();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { onboardedAt: true },
  });
  if (!user) redirect("/login");
  if (!needsOnboarding(user.onboardedAt)) redirect("/dashboard");

  return <OnboardingForm teamsAvailable={teamsEnabled()} />;
}
