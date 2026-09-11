import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Platform } from "@prisma/client";
import { createUnifiedInbox, ConnectedAccount } from "@/lib/inbox";
import { InboxFetchOptions, InboxItemType } from "@/types/inbox";
import { decrypt } from "@/lib/encryption";

export async function GET(req: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const socialAccounts = await prisma.socialAccount.findMany({
      where: { userId: session.user.id, isActive: true },
      select: {
        platform: true,
        accessToken: true,
        platformUserId: true,
      },
    });

    if (socialAccounts.length === 0) {
      return NextResponse.json({
        items: [],
        totalCount: 0,
        platforms: [],
        message: "No connected accounts",
      });
    }

    const connectedAccounts: ConnectedAccount[] = socialAccounts.map((account) => ({
      platform: account.platform,
      accessToken: decrypt(account.accessToken),
      platformUserId: account.platformUserId,
    }));

    const platformsParam = req.nextUrl.searchParams.get("platforms");
    const typesParam = req.nextUrl.searchParams.get("types");
    const unreadOnly = req.nextUrl.searchParams.get("unreadOnly") === "true";
    const limitParam = req.nextUrl.searchParams.get("limit");
    const sortBy = req.nextUrl.searchParams.get("sortBy") as "newest" | "oldest" | null;

    const options: InboxFetchOptions = {};

    if (platformsParam) {
      options.platforms = platformsParam.split(",").filter(Boolean) as Platform[];
    }

    if (typesParam) {
      options.types = typesParam.split(",").filter(Boolean) as InboxItemType[];
    }

    if (unreadOnly) {
      options.unreadOnly = true;
    }

    if (limitParam) {
      options.limit = parseInt(limitParam, 10);
    }

    if (sortBy) {
      options.sortBy = sortBy;
    }

    const inbox = createUnifiedInbox(connectedAccounts);
    const result = await inbox.fetchAll(options);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching inbox:", error);
    return NextResponse.json(
      { error: "Failed to fetch inbox" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { itemId, platform, action, content } = body;

    if (!itemId || !platform) {
      return NextResponse.json(
        { error: "Missing required fields: itemId, platform" },
        { status: 400 }
      );
    }

    const socialAccount = await prisma.socialAccount.findFirst({
      where: {
        userId: session.user.id,
        platform: platform as Platform,
        isActive: true,
      },
      select: {
        accessToken: true,
        platformUserId: true,
        platform: true,
      },
    });

    if (!socialAccount) {
      return NextResponse.json(
        { error: "Account not connected for this platform" },
        { status: 404 }
      );
    }

    const connectedAccount: ConnectedAccount = {
      platform: socialAccount.platform,
      accessToken: decrypt(socialAccount.accessToken),
      platformUserId: socialAccount.platformUserId,
    };

    const inbox = createUnifiedInbox([connectedAccount]);

    if (action === "markAsRead") {
      const success = await inbox.markAsRead(itemId, platform as Platform);
      return NextResponse.json({ success });
    }

    if (action === "reply") {
      if (!content) {
        return NextResponse.json(
          { error: "Missing content for reply" },
          { status: 400 }
        );
      }
      const result = await inbox.reply(itemId, platform as Platform, content);
      return NextResponse.json(result);
    }

    return NextResponse.json(
      { error: "Invalid action. Use 'markAsRead' or 'reply'" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Error updating inbox item:", error);
    return NextResponse.json(
      { error: "Failed to update inbox item" },
      { status: 500 }
    );
  }
}
