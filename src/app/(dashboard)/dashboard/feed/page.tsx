"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { Platform, PostStatus } from "@prisma/client";
import { Award, CalendarDays, Check, ChevronDown, Heart, ImageIcon, Lightbulb, Loader2, MessageCircle, MoreHorizontal, PartyPopper, Pencil, Send, Share2, Sparkles, ThumbsUp, UserRound } from "lucide-react";
import { Header } from "@/components/dashboard/header";
import { OrcMark } from "@/components/icons/orc-mark";
import { platformIcons } from "@/components/icons/platform-icons";
import { PLATFORM_CONFIGS } from "@/types/platform";

type Profile = { id: string; name: string | null; email: string | null; image: string | null; headline: string | null; bio: string | null; location: string | null; website: string | null; coverImageUrl: string | null; role: string };
type Reaction = { userId: string; type: string };
type Comment = { id: string; content: string; createdAt: string; user: { id: string; name: string | null; image: string | null } };
type FeedPost = {
  id: string; title: string | null; content: string; platform: Platform; status: PostStatus; createdAt: string; publishedAt: string | null;
  platformPostUrl: string | null; user: { id: string; name: string | null; image: string | null; headline: string | null; role: string };
  mediaAssets: { mediaAsset: { id: string; url: string; mimeType: string; filename: string } }[];
  feedReactions: Reaction[]; feedComments: Comment[];
};
const reactionOptions = [
  { type: "LIKE", label: "Like", icon: ThumbsUp }, { type: "CELEBRATE", label: "Celebrate", icon: PartyPopper },
  { type: "INSIGHTFUL", label: "Insightful", icon: Lightbulb }, { type: "SUPPORT", label: "Support", icon: Heart },
];
function initials(name?: string | null) { return (name || "Social Orc").split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase(); }
function relativeTime(value: string) {
  const seconds = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "now"; if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`; if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function FeedPage() {
  const [posts, setPosts] = useState<FeedPost[]>([]), [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState(""), [posting, setPosting] = useState(false);
  const [content, setContent] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>([Platform.LINKEDIN]);
  const [platformMenuOpen, setPlatformMenuOpen] = useState(false);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({}), [busy, setBusy] = useState("");
  const loadFeed = useCallback(async () => {
    setLoading(true); setError("");
    try { const response = await fetch("/api/feed"); const data = await response.json(); if (!response.ok) throw new Error(data.error); setPosts(data.posts); setProfile(data.profile); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load the timeline."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void loadFeed(); }, [loadFeed]);
  const stats = useMemo(() => ({ total: posts.length, published: posts.filter(post => post.status === "PUBLISHED").length, reactions: posts.reduce((sum, post) => sum + post.feedReactions.length, 0) }), [posts]);

  function togglePlatform(target: Platform) {
    setSelectedPlatforms(current => current.includes(target) ? current.filter(value => value !== target) : [...current, target]);
  }
  async function createPost(event: FormEvent) {
    event.preventDefault(); if (!content.trim() || selectedPlatforms.length === 0) return; setPosting(true); setError("");
    try {
      // One post per selected platform: SocialOrc's Post model is single-platform
      // (same shape Drafts/Approvals/Scheduled already rely on), so "post to
      // several platforms at once" fans out into one create call per platform
      // rather than widening that model.
      const responses = await Promise.all(selectedPlatforms.map(target =>
        fetch("/api/posts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: content.trim(), platform: target }) })
      ));
      const failedCount = responses.filter(response => !response.ok).length;
      if (failedCount > 0) throw new Error(`Could not post to ${failedCount} of ${selectedPlatforms.length} platform${selectedPlatforms.length === 1 ? "" : "s"}.`);
      setContent(""); await loadFeed();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not create post."); }
    finally { setPosting(false); }
  }
  async function react(postId: string, type: string) {
    setBusy(`reaction-${postId}`);
    try { const response = await fetch("/api/feed/reactions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ postId, type }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); setPosts(current => current.map(post => post.id === postId ? { ...post, feedReactions: data.reactions } : post)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save reaction."); } finally { setBusy(""); }
  }
  async function comment(postId: string) {
    const text = commentDrafts[postId]?.trim(); if (!text) return; setBusy(`comment-${postId}`);
    try { const response = await fetch("/api/feed/comments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ postId, content: text }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); setPosts(current => current.map(post => post.id === postId ? { ...post, feedComments: [...post.feedComments, data.comment] } : post)); setCommentDrafts(current => ({ ...current, [postId]: "" })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not add comment."); } finally { setBusy(""); }
  }

  return <div className="feed-page"><Header title="Social Timeline" description="Your posts, conversations, and presence in one place." />
    <div className="feed-shell">
      {error && <div className="feed-alert" role="alert">{error}<button onClick={() => setError("")}>Dismiss</button></div>}
      <aside className="feed-left">
        <section className="profile-mini-card"><div className="profile-mini-cover" style={profile?.coverImageUrl ? { backgroundImage: `url(${profile.coverImageUrl})` } : undefined} /><div className="profile-mini-content"><span className="feed-avatar feed-avatar-large">{profile?.image ? <img src={profile.image} alt="" /> : initials(profile?.name)}</span><h2>{profile?.name || "Your profile"}</h2><p>{profile?.headline || "Social media commander"}</p><span>{profile?.location || profile?.email}</span><Link href="/dashboard/profile"><Pencil size={12} /> Edit profile</Link></div><div className="profile-mini-stats"><span><strong>{stats.total}</strong>Posts</span><span><strong>{stats.published}</strong>Published</span><span><strong>{stats.reactions}</strong>Reactions</span></div></section>
        <section className="feed-side-card"><h3><Award size={15} /> Creator progress</h3><p>Every drafted idea moves your content empire forward.</p><div className="feed-progress"><span style={{ width: `${Math.min(100, stats.total * 10)}%` }} /></div><small>{Math.min(100, stats.total * 10)}% toward your next milestone</small></section>
      </aside>
      <main className="feed-main">
        <form className="feed-composer" onSubmit={createPost}><div className="feed-composer-top"><span className="feed-avatar">{profile?.image ? <img src={profile.image} alt="" /> : initials(profile?.name)}</span><textarea aria-label="Create a post" value={content} onChange={event => setContent(event.target.value)} maxLength={5000} placeholder="What do you want your audience to know?" /></div><div className="feed-composer-actions"><span><ImageIcon size={15} /> Media is added in Content Forge</span><div className="feed-platform-picker">
          <button type="button" aria-haspopup="listbox" aria-expanded={platformMenuOpen} onClick={() => setPlatformMenuOpen(open => !open)}>
            {selectedPlatforms.length === 0 ? "Choose platforms" : selectedPlatforms.length === 1 ? <>{(() => { const Icon = platformIcons[selectedPlatforms[0]]; return <Icon className="h-4 w-4" />; })()}{PLATFORM_CONFIGS[selectedPlatforms[0]].name}</> : <>{selectedPlatforms.slice(0, 3).map(value => { const Icon = platformIcons[value]; return <Icon key={value} className="h-4 w-4" />; })}{selectedPlatforms.length > 3 && <small>+{selectedPlatforms.length - 3}</small>}</>}
            <ChevronDown size={12} />
          </button>
          {platformMenuOpen && <>
            <div className="feed-platform-backdrop" onClick={() => setPlatformMenuOpen(false)} />
            <div className="feed-platform-menu" role="listbox" aria-label="Platforms to post to" aria-multiselectable="true">
              {Object.values(Platform).map(value => {
                const Icon = platformIcons[value], active = selectedPlatforms.includes(value);
                return <button type="button" key={value} role="option" aria-selected={active} className={active ? "is-selected" : ""} onClick={() => togglePlatform(value)}>
                  <Icon className="h-4 w-4" />{PLATFORM_CONFIGS[value].name}{active && <Check size={13} />}
                </button>;
              })}
            </div>
          </>}
        </div><button disabled={posting || !content.trim() || selectedPlatforms.length === 0}>{posting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Post to timeline{selectedPlatforms.length > 1 ? ` (${selectedPlatforms.length})` : ""}</button></div></form>
        <nav className="feed-filter" aria-label="Timeline filter"><button aria-current="page">All posts</button><Link href="/dashboard/drafts">Drafts</Link><Link href="/dashboard/scheduled">Scheduled</Link></nav>
        {loading ? <div className="feed-loading"><Loader2 className="animate-spin" /> Loading timeline…</div> : posts.length === 0 ? <section className="feed-empty"><OrcMark className="h-16 w-14" /><h2>Your timeline is ready.</h2><p>Publish your first thought above or use Content Forge for an AI-assisted campaign.</p><Link href="/dashboard/create"><Sparkles size={14} /> Open Content Forge</Link></section> : <div className="feed-stream">{posts.map(post => {
          const PlatformIcon = platformIcons[post.platform], myReaction = post.feedReactions.find(item => item.userId === profile?.id)?.type;
          const reactionCounts = Object.fromEntries(reactionOptions.map(option => [option.type, post.feedReactions.filter(item => item.type === option.type).length]));
          return <article className="feed-post" key={post.id}><header><span className="feed-avatar">{post.user.image ? <img src={post.user.image} alt="" /> : initials(post.user.name)}</span><div><Link href="/dashboard/profile">{post.user.name || "SocialOrc creator"}</Link><p>{post.user.headline || `${post.user.role} · SocialOrc`}</p><small>{relativeTime(post.createdAt)} · <PlatformIcon className="h-3 w-3" /> {PLATFORM_CONFIGS[post.platform].name}</small></div><button aria-label="Post options"><MoreHorizontal size={18} /></button></header>{post.title && <h2>{post.title}</h2>}<p className="feed-post-copy">{post.content}</p>{post.mediaAssets.length > 0 && <div className={`feed-media feed-media-${Math.min(4, post.mediaAssets.length)}`}>{post.mediaAssets.slice(0, 4).map(({ mediaAsset }) => mediaAsset.mimeType.startsWith("video/") ? <video key={mediaAsset.id} src={mediaAsset.url} controls /> : <img key={mediaAsset.id} src={mediaAsset.url} alt={mediaAsset.filename} />)}</div>}<div className="feed-post-meta"><span>{post.feedReactions.length > 0 ? `${post.feedReactions.length} reaction${post.feedReactions.length === 1 ? "" : "s"}` : "Be the first to react"}</span><span>{post.feedComments.length} comment{post.feedComments.length === 1 ? "" : "s"} · <em>{post.status.replaceAll("_", " ")}</em></span></div><div className="feed-reactions">{reactionOptions.map(({ type, label, icon: Icon }) => <button key={type} aria-pressed={myReaction === type} disabled={busy === `reaction-${post.id}`} onClick={() => react(post.id, type)}><Icon size={15} /><span>{label}</span>{reactionCounts[type] > 0 && <small>{reactionCounts[type]}</small>}</button>)}<button onClick={() => document.getElementById(`comment-${post.id}`)?.focus()}><MessageCircle size={15} /><span>Comment</span></button>{post.platformPostUrl && <a href={post.platformPostUrl} target="_blank" rel="noreferrer"><Share2 size={15} /><span>Open</span></a>}</div>{post.feedComments.length > 0 && <div className="feed-comments">{post.feedComments.map(item => <div key={item.id}><span className="feed-avatar feed-avatar-small">{item.user.image ? <img src={item.user.image} alt="" /> : initials(item.user.name)}</span><p><strong>{item.user.name || "You"}</strong>{item.content}<small>{relativeTime(item.createdAt)}</small></p></div>)}</div>}<form className="feed-comment-box" onSubmit={event => { event.preventDefault(); void comment(post.id); }}><span className="feed-avatar feed-avatar-small">{profile?.image ? <img src={profile.image} alt="" /> : initials(profile?.name)}</span><input id={`comment-${post.id}`} aria-label="Write a comment" value={commentDrafts[post.id] || ""} onChange={event => setCommentDrafts(current => ({ ...current, [post.id]: event.target.value }))} placeholder="Add a comment…" maxLength={1000} /><button disabled={!commentDrafts[post.id]?.trim() || busy === `comment-${post.id}`} aria-label="Post comment">{busy === `comment-${post.id}` ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}</button></form></article>;
        })}</div>}
      </main>
      <aside className="feed-right"><section className="feed-side-card"><h3><Sparkles size={15} /> Timeline tools</h3><Link href="/dashboard/create">Create a campaign<Send size={12} /></Link><Link href="/dashboard/approvals">Review approvals<Check size={12} /></Link><Link href="/dashboard/scheduled">Publishing calendar<CalendarDays size={12} /></Link></section><section className="feed-side-card feed-tip"><UserRound size={18} /><h3>Complete your profile</h3><p>A clear headline and bio make every preview feel more authentic.</p><Link href="/dashboard/profile">Open profile</Link></section></aside>
    </div>
  </div>;
}
