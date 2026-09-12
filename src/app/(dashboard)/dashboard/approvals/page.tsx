"use client";

import { Header } from "@/components/dashboard/header";
import { ContentWorkflow } from "@/components/dashboard/content-workflow";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useCallback, useEffect, useState } from "react";
import { Post, SocialAccount, PostMedia, MediaAsset, PostStatus } from "@prisma/client";
import { platformIcons } from "@/components/icons/platform-icons";
import { PLATFORM_CONFIGS } from "@/types/platform";
import { CalendarDays, CheckCircle2, ChevronRight, FileCheck2, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import Link from "next/link";

type ReviewPost = Post & { socialAccount: SocialAccount | null; mediaAssets: (PostMedia & { mediaAsset: MediaAsset })[] };

export default function ApprovalsPage() {
  const [posts,setPosts] = useState<ReviewPost[]>([]);
  const [queue,setQueue] = useState<ReviewPost[]>([]);
  const [selected,setSelected] = useState<string | null>(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");
  const [busy,setBusy] = useState(false);
  const [rejecting,setRejecting] = useState(false);
  const [reason,setReason] = useState("");
  const post = posts.find(p=>p.id===selected) || posts[0];
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const results=await Promise.all([fetch(`/api/posts?status=${PostStatus.PENDING_APPROVAL}`),fetch(`/api/posts?status=${PostStatus.SCHEDULED}`)]);
      if(results.some(r=>!r.ok)) throw new Error("Could not load the review workspace. Please try again.");
      const [review,scheduled]=await Promise.all(results.map(r=>r.json()));
      setPosts(review.posts || []);
      setQueue((scheduled.posts || []).sort((a:ReviewPost,b:ReviewPost)=>new Date(a.scheduledFor || 0).getTime()-new Date(b.scheduledFor || 0).getTime()));
    }catch(err){setError(err instanceof Error?err.message:"Could not load posts.");}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void load();},[load]);
  async function act(action:"approve"|"reject"|"delete") {
    if (!post || busy) return;
    if(action==="delete" && !window.confirm("Delete this post? This action cannot be undone.")) return;
    setBusy(true);setError("");setNotice("");
    const id=post.id;
    try {
      const res=await fetch(action==="delete"?`/api/posts/${id}`:`/api/posts/${id}/approve`,{method:action==="delete"?"DELETE":"POST",headers:{"Content-Type":"application/json"},...(action!=="delete"?{body:JSON.stringify({action,reason:action==="reject"?reason:undefined})}:{})});
      if(!res.ok){const data=await res.json();throw new Error(data.error || "The action failed. Please try again.");}
      setPosts(prev=>prev.filter(p=>p.id!==id));setSelected(null);setRejecting(false);setReason("");
      setNotice(action==="approve"?"Post approved. It is ready to schedule from Drafts.":action==="reject"?"Post returned to Drafts for revision.":"Post deleted.");
    }catch(err){setError(err instanceof Error?err.message:"The action failed.");}
    finally{setBusy(false);}
  }
  const Icon=post?platformIcons[post.platform]:FileCheck2;
  const withinLimit=post?post.content.length<=PLATFORM_CONFIGS[post.platform].maxTextLength:false;
  return <div><Header title="Campaign Workflow" description="Review, approve, and prepare your content for publishing."/>
    <div className="studio-page">
      <section className="studio-banner"><span className="eyebrow">CAMPAIGNS</span><h1>Campaign Workflow</h1><p>Every channel. Every detail. Your final approval.</p></section>
      <ContentWorkflow active="Approve"/>
      {error&&<div role="alert" className="studio-error">{error} <button onClick={load} disabled={loading || busy}>Retry</button></div>}
      {notice&&<div role="status" className="studio-notice">{notice} <Link href="/dashboard/drafts">Open Drafts →</Link></div>}
      {loading?<div className="studio-empty" role="status"><Loader2 className="animate-spin"/><p>Loading your review workspace…</p></div>:<div className="review-grid">
        <section className="studio-panel review-list"><div className="studio-panel-heading"><h2>Pending Review <span className="count-badge">{posts.length}</span></h2><p>Select a post to give it a final check.</p></div>
          {!posts.length?<div className="studio-empty"><CheckCircle2 size={26}/><h3>All caught up.</h3><p>Posts submitted for review will appear here.</p><Link href="/dashboard/drafts">View drafts →</Link></div>:<div className="review-items">{posts.map(p=>{const ItemIcon=platformIcons[p.platform];return <button key={p.id} disabled={busy} className="review-item" aria-pressed={post?.id===p.id} onClick={()=>{setSelected(p.id);setRejecting(false);setReason("");}}><span className="review-thumbnail"><ItemIcon className="h-6 w-6"/></span><span className="review-item-copy"><span className="review-channel">{PLATFORM_CONFIGS[p.platform].name}</span><strong>{p.title || p.content.slice(0,65)}</strong><span className="review-excerpt">{p.content}</span><span className="review-status">Needs approval</span></span></button>;})}</div>}
        </section>
        <section className="studio-panel review-detail"><div className="studio-panel-heading"><h2><FileCheck2 size={16}/> Approval Detail</h2><p>Review the message before giving the green light.</p></div>
          {post?<><div className="review-detail-title"><Icon className="h-5 w-5"/><div><h3>{post.title || "Untitled post"}</h3><p>{PLATFORM_CONFIGS[post.platform].name} · {post.socialAccount?.displayName || "No account selected"}</p></div></div>
            <div className="review-copy"><span className="eyebrow">POST CONTENT</span><p>{post.content}</p></div>
            {post.mediaAssets.length>0&&<div className="review-media"><h3>Attached media</h3>{post.mediaAssets.map(m=><a key={m.id} href={m.mediaAsset.url} target="_blank" rel="noopener noreferrer">View attachment <ChevronRight size={13}/></a>)}</div>}
            <div className="review-checklist"><h3>Review Checklist</h3><div><CheckCircle2 size={14}/><span>Content prepared</span><strong>{post.content.length} characters</strong></div><div className={withinLimit?"":"check-warning"}><ShieldCheck size={14}/><span>Platform text limit</span><strong>{withinLimit?"Within limit":"Needs trimming"}</strong></div><div className={post.socialAccount?"":"check-warning"}><CalendarDays size={14}/><span>Publishing account</span><strong>{post.socialAccount?"Selected":"Choose before scheduling"}</strong></div></div>
            {rejecting&&<div className="revision-form"><Label htmlFor="revision-reason">Revision note (optional)</Label><Textarea id="revision-reason" value={reason} onChange={e=>setReason(e.target.value)} disabled={busy} placeholder="What should change before this post is approved?" rows={3}/><div className="flex gap-2"><Button disabled={busy} variant="outline" onClick={()=>act("reject")}>Return to drafts</Button><Button disabled={busy} variant="ghost" onClick={()=>setRejecting(false)}>Cancel</Button></div></div>}
            <div className="review-actions"><Button variant="ghost" size="icon" aria-label="Delete selected post" disabled={busy} onClick={()=>act("delete")}><Trash2 size={16}/></Button><Button variant="outline" disabled={busy} onClick={()=>setRejecting(true)}>Request changes</Button><Button disabled={busy} onClick={()=>act("approve")}>{busy?<Loader2 size={15} className="animate-spin"/>:<CheckCircle2 size={15}/>}Approve post</Button></div>
            <p className="review-disclaimer">Approval does not publish this post. Choose its schedule separately.</p>
          </>:<div className="studio-empty detail-empty"><ShieldCheck size={38}/><h3>Nothing waiting for your approval.</h3><p>Review, refine, and approve your next post here.<br/>You always have the final say.</p><Link className="cta cta-small" href="/dashboard/create">Forge new content →</Link></div>}
        </section>
        <aside className="studio-panel publishing-queue"><div className="studio-panel-heading"><h2><CalendarDays size={16}/> Publishing Queue</h2><p>Your next scheduled posts.</p></div>
          {queue.length?<div className="queue-items">{queue.slice(0,8).map(p=>{const QueueIcon=platformIcons[p.platform];return <div className="queue-item" key={p.id}><QueueIcon className="h-5 w-5"/><div><h3>{p.title || p.content.slice(0,60)}</h3><p>{p.scheduledFor?new Date(p.scheduledFor).toLocaleString(undefined,{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}):"Time not set"}</p></div><span className="review-status">Scheduled</span></div>;})}</div>:<div className="studio-empty"><CalendarDays size={25}/><h3>A clear calendar.</h3><p>Your scheduled content will appear here once you approve and schedule a post.</p></div>}
          <Link href="/dashboard/scheduled" className="queue-link">View publishing schedule <ChevronRight size={14}/></Link><div className="approval-reminder"><ShieldCheck size={23}/><h3>Publish with confidence.</h3><p>Only approved posts can be scheduled. Keep your message intentional, from first draft to final post.</p></div>
        </aside>
      </div>}
      <div className="studio-footer"><ShieldCheck size={15}/><span>Your approval is required before scheduling.</span><Link href="/dashboard/drafts">Manage drafts <ChevronRight size={13}/></Link></div>
    </div>
  </div>;
}
