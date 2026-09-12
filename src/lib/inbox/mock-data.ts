import { Platform } from "@prisma/client";
import { InboxItem } from "@/types/inbox";

const now = Date.now();
const hour = 3600 * 1000;
const day = 24 * hour;

/**
 * Mock inbox items for testing unified inbox aggregation.
 * Each platform has distinct mock data so the inbox can prove ≥2 networks.
 */
export const MOCK_INBOX_ITEMS: Record<Platform, InboxItem[]> = {
  TWITTER: [
    {
      id: "tw_comment_1",
      platform: Platform.TWITTER,
      type: "reply",
      author: {
        id: "tw_user_12345",
        username: "techguru2024",
        displayName: "Tech Guru",
        profileImageUrl: "https://pbs.twimg.com/profile_images/mock/techguru.jpg",
      },
      content: "Great post! Really insightful thoughts on AI marketing.",
      createdAt: new Date(now - 2 * hour).toISOString(),
      postReference: {
        platformPostId: "tw_post_abc123",
        platformPostUrl: "https://x.com/user/status/abc123",
        contentPreview: "Here's my take on AI in marketing...",
      },
      isRead: false,
      isReplied: false,
      metadata: { tweetId: "tw_comment_1", conversationId: "tw_conv_1" },
    },
    {
      id: "tw_mention_1",
      platform: Platform.TWITTER,
      type: "mention",
      author: {
        id: "tw_user_67890",
        username: "marketingpro",
        displayName: "Marketing Pro",
        profileImageUrl: "https://pbs.twimg.com/profile_images/mock/marketingpro.jpg",
      },
      content: "@yourhandle What tools do you use for scheduling posts?",
      createdAt: new Date(now - 5 * hour).toISOString(),
      isRead: false,
      isReplied: false,
      metadata: { tweetId: "tw_mention_1" },
    },
    {
      id: "tw_comment_2",
      platform: Platform.TWITTER,
      type: "comment",
      author: {
        id: "tw_user_11111",
        username: "startupfounder",
        displayName: "Jane Startup",
        profileImageUrl: "https://pbs.twimg.com/profile_images/mock/jane.jpg",
      },
      content: "This is exactly what we needed for our launch strategy!",
      createdAt: new Date(now - 1 * day).toISOString(),
      postReference: {
        platformPostId: "tw_post_def456",
        platformPostUrl: "https://x.com/user/status/def456",
        contentPreview: "5 tips for a successful product launch...",
      },
      isRead: true,
      isReplied: true,
      metadata: { tweetId: "tw_comment_2" },
    },
    {
      id: "tw_dm_1",
      platform: Platform.TWITTER,
      type: "message",
      author: {
        id: "tw_user_22222",
        username: "potentialclient",
        displayName: "Potential Client",
      },
      content: "Hi! I saw your post about marketing automation. Can we chat?",
      createdAt: new Date(now - 30 * 60 * 1000).toISOString(),
      isRead: false,
      isReplied: false,
      metadata: { dmId: "tw_dm_1", conversationType: "direct_message" },
    },
  ],

  LINKEDIN: [
    {
      id: "li_comment_1",
      platform: Platform.LINKEDIN,
      type: "comment",
      author: {
        id: "li_user_abc123",
        username: "john-smith-cto",
        displayName: "John Smith, CTO at TechCorp",
        profileImageUrl: "https://media.licdn.com/dms/mock/john-smith.jpg",
      },
      content: "Excellent insights on digital transformation! We implemented similar strategies last quarter.",
      createdAt: new Date(now - 3 * hour).toISOString(),
      postReference: {
        platformPostId: "li_post_xyz789",
        platformPostUrl: "https://www.linkedin.com/feed/update/xyz789",
        contentPreview: "3 pillars of digital transformation...",
      },
      isRead: false,
      isReplied: false,
      metadata: { urn: "urn:li:comment:li_comment_1" },
    },
    {
      id: "li_mention_1",
      platform: Platform.LINKEDIN,
      type: "mention",
      author: {
        id: "li_user_def456",
        username: "sarah-marketer",
        displayName: "Sarah Johnson | Growth Marketing",
        profileImageUrl: "https://media.licdn.com/dms/mock/sarah.jpg",
      },
      content: "Totally agree with @yourprofile on this — data-driven decisions are key!",
      createdAt: new Date(now - 8 * hour).toISOString(),
      isRead: false,
      isReplied: false,
      metadata: { urn: "urn:li:activity:li_mention_1" },
    },
    {
      id: "li_comment_2",
      platform: Platform.LINKEDIN,
      type: "comment",
      author: {
        id: "li_user_ghi789",
        username: "mike-investor",
        displayName: "Michael Brown | Angel Investor",
        profileImageUrl: "https://media.licdn.com/dms/mock/mike.jpg",
      },
      content: "This is the kind of content founders should read. Would love to connect!",
      createdAt: new Date(now - 2 * day).toISOString(),
      postReference: {
        platformPostId: "li_post_uvw123",
        platformPostUrl: "https://www.linkedin.com/feed/update/uvw123",
        contentPreview: "What I learned from raising our seed round...",
      },
      isRead: true,
      isReplied: false,
      metadata: { urn: "urn:li:comment:li_comment_2" },
    },
    {
      id: "li_msg_1",
      platform: Platform.LINKEDIN,
      type: "message",
      author: {
        id: "li_user_jkl012",
        username: "recruiter-big-tech",
        displayName: "Emily Chen | Tech Recruiter",
      },
      content: "Hi! I came across your profile and thought you'd be a great fit for a role we're hiring for.",
      createdAt: new Date(now - 4 * hour).toISOString(),
      isRead: false,
      isReplied: false,
      metadata: { conversationId: "li_conv_1" },
    },
  ],

  INSTAGRAM: [
    {
      id: "ig_comment_1",
      platform: Platform.INSTAGRAM,
      type: "comment",
      author: {
        id: "ig_user_photo123",
        username: "visual_storyteller",
        displayName: "Visual Storyteller",
        profileImageUrl: "https://instagram.mock/profiles/visual.jpg",
      },
      content: "Love this aesthetic! 🔥 What camera do you use?",
      createdAt: new Date(now - 1 * hour).toISOString(),
      postReference: {
        platformPostId: "ig_post_123",
        contentPreview: "[Photo of product launch event]",
      },
      isRead: false,
      isReplied: false,
      metadata: { mediaId: "ig_media_123" },
    },
    {
      id: "ig_mention_1",
      platform: Platform.INSTAGRAM,
      type: "mention",
      author: {
        id: "ig_user_brand456",
        username: "lifestyle_brand",
        displayName: "Lifestyle Brand Official",
      },
      content: "Thanks @yourhandle for the feature! ❤️",
      createdAt: new Date(now - 12 * hour).toISOString(),
      isRead: true,
      isReplied: true,
      metadata: { storyMention: false },
    },
  ],

  FACEBOOK: [
    {
      id: "fb_comment_1",
      platform: Platform.FACEBOOK,
      type: "comment",
      author: {
        id: "fb_user_page123",
        username: "communitymember",
        displayName: "Community Member",
      },
      content: "This is exactly what our community needed! Thanks for sharing.",
      createdAt: new Date(now - 6 * hour).toISOString(),
      postReference: {
        platformPostId: "fb_post_789",
        platformPostUrl: "https://facebook.com/page/posts/789",
        contentPreview: "Community update: New features coming soon...",
      },
      isRead: false,
      isReplied: false,
      metadata: { pageId: "fb_page_123" },
    },
    {
      id: "fb_msg_1",
      platform: Platform.FACEBOOK,
      type: "message",
      author: {
        id: "fb_user_customer1",
        displayName: "Customer Support Query",
      },
      content: "Hi, I have a question about your services. Are you available for a call?",
      createdAt: new Date(now - 45 * 60 * 1000).toISOString(),
      isRead: false,
      isReplied: false,
      metadata: { pageInbox: true },
    },
  ],

  TIKTOK: [
    {
      id: "tt_comment_1",
      platform: Platform.TIKTOK,
      type: "comment",
      author: {
        id: "tt_user_viral123",
        username: "viral_creator",
        displayName: "Viral Creator ✨",
      },
      content: "This is going viral! 🚀 Collab?",
      createdAt: new Date(now - 2 * hour).toISOString(),
      postReference: {
        platformPostId: "tt_video_456",
        contentPreview: "[Product demo video]",
      },
      isRead: false,
      isReplied: false,
      metadata: { videoId: "tt_video_456" },
    },
  ],

  YOUTUBE: [
    {
      id: "yt_comment_1",
      platform: Platform.YOUTUBE,
      type: "comment",
      author: {
        id: "yt_user_sub123",
        username: "loyal_subscriber",
        displayName: "Loyal Subscriber",
        profileImageUrl: "https://yt.mock/avatars/sub123.jpg",
      },
      content: "Best video on this topic! Please make a follow-up about advanced strategies.",
      createdAt: new Date(now - 10 * hour).toISOString(),
      postReference: {
        platformPostId: "yt_video_abc",
        platformPostUrl: "https://youtube.com/watch?v=abc",
        contentPreview: "How to grow your audience in 2024",
      },
      isRead: false,
      isReplied: false,
      metadata: { videoId: "yt_video_abc", likeCount: 42 },
    },
  ],

  TELEGRAM: [
    {
      id: "tg_msg_1",
      platform: Platform.TELEGRAM,
      type: "message",
      author: {
        id: "tg_user_123",
        username: "telegram_user",
        displayName: "Telegram User",
      },
      content: "Hi! I saw your channel post about marketing tips. Very helpful!",
      createdAt: new Date(now - 1 * hour).toISOString(),
      isRead: false,
      isReplied: false,
      metadata: { chatId: "tg_chat_123" },
    },
  ],
};

/**
 * Get mock inbox items for a specific platform or all platforms.
 */
export function getMockInboxItems(platform?: Platform): InboxItem[] {
  if (platform) {
    return MOCK_INBOX_ITEMS[platform] || [];
  }
  return Object.values(MOCK_INBOX_ITEMS).flat();
}
