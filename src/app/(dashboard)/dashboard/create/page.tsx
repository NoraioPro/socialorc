"use client";

import { useState } from "react";
import Link from "next/link";
import { Header } from "@/components/dashboard/header";
import { ContentWorkflow } from "@/components/dashboard/content-workflow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Platform } from "@prisma/client";
import { PLATFORM_CONFIGS } from "@/types/platform";
import { Wand2, Loader2, Check, ShieldCheck, Sparkles, PenLine, ArrowRight } from "lucide-react";
import { platformIcons } from "@/components/icons/platform-icons";
import { PlatformCharCounts } from "@/components/posts/platform-char-counts";

type Variant = { platform: Platform; content: string };
const availablePlatforms = Object.values(Platform);

export default function CreatePostPage() {
  const [title, setTitle] = useState("");
  const [idea, setIdea] = useState("");
  const [audience, setAudience] = useState("");
  const [cta, setCta] = useState("");
  const [tone, setTone] = useState("professional");
  const [platforms, setPlatforms] = useState<Platform[]>(["LINKEDIN"]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [active, setActive] = useState<Platform>("LINKEDIN");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<Platform[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const current = variants.find(v => v.platform === active);
  const limit = PLATFORM_CONFIGS[active].maxTextLength;
  const toggle = (p: Platform) => setPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev,p]);

  async function generate() {
    if (!idea.trim() || !platforms.length || busy || saving || platforms.includes("TELEGRAM")) return;
    if (variants.length && !window.confirm("Replace the current variants with new drafts? Unsaved edits will be lost.")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const brief = [idea, title && `Campaign: ${title}`, audience && `Audience: ${audience}`, cta && `Call to action: ${cta}`].filter(Boolean).join("\n");
      const response = await fetch("/api/posts/generate", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"generate",idea:brief,platforms,tone})});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to generate content. Your existing drafts are still here.");
      if (!Array.isArray(data.variants) || !data.variants.length) throw new Error("No variants were returned. Try refining your brief.");
      setVariants(data.variants); setActive(data.variants[0].platform); setSaved([]);
      setNotice("Variants generated. Select a channel to review and edit its draft.");
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to generate content."); }
    finally { setBusy(false); }
  }
  function startManual() {
    if (!platforms.length || busy || saving) return;
    if (variants.length && !window.confirm("Replace the current variants with manual drafts? Unsaved edits will be lost.")) return;
    setVariants(platforms.map(platform => ({platform,content:idea}))); setActive(platforms[0]); setSaved([]); setError(""); setNotice("Manual drafts ready. Edit each channel below.");
  }
  function edit(content:string) {
    setVariants(prev => prev.map(v => v.platform === active ? {...v,content} : v));
    setNotice("");
  }
  async function save(all:boolean) {
    const pending = (all ? variants : current ? [current] : []).filter(v => !saved.includes(v.platform));
    if (!pending.length || saving || busy) return;
    if (pending.some(v => !v.content.trim() || v.content.length > PLATFORM_CONFIGS[v.platform].maxTextLength)) {setError("Every selected draft needs content within its platform character limit.");return;}
    setSaving(true); setError(""); setNotice(""); let count = 0;
    try {
      for (const variant of pending) {
        const res = await fetch("/api/posts",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...variant,title:title || undefined})});
        if (!res.ok) {const data = await res.json(); throw new Error(data.error || "Could not save the draft.");}
        setSaved(prev => [...prev,variant.platform]); count++;
      }
      setNotice(`${count} ${count === 1 ? "draft saved" : "drafts saved"}. Open Drafts to continue your review.`);
    } catch(err) {setError(`${count ? `${count} drafts saved. ` : ""}${err instanceof Error ? err.message : "Save failed."} Saved channels will not be duplicated when you retry.`);}
    finally {setSaving(false);}
  }
  return <div>
    <Header title="Content Forge" description="Create. Amplify. Dominate." />
    <div className="studio-page">
      <section className="studio-banner"><span className="eyebrow">CREATE · AMPLIFY · DOMINATE</span><h1>Content Forge</h1><p>Turn one idea into content for every channel.</p></section>
      <ContentWorkflow active="Generate" />
      {error && <div className="studio-error" role="alert">{error}</div>}
      {notice && <div className="studio-notice" role="status">{notice} {saved.length > 0 && <Link href="/dashboard/drafts">Open Drafts →</Link>}</div>}
      <div className="forge-grid">
        <section className="studio-panel brief-panel" aria-labelledby="brief-title">
          <div className="studio-panel-heading"><h2 id="brief-title"><PenLine size={16} /> Content Brief</h2><p>Tell us about your content. The more detail, the better.</p></div>
          <fieldset disabled={busy || saving} className="studio-fields">
            <div><Label htmlFor="campaign-title">Campaign / post title</Label><Input id="campaign-title" value={title} onChange={e=>setTitle(e.target.value)} placeholder="Give your next big idea a name" /></div>
            <div><Label htmlFor="audience">Audience</Label><Input id="audience" value={audience} onChange={e=>setAudience(e.target.value)} placeholder="Who are you speaking to?" /></div>
            <div><Label htmlFor="tone">Tone</Label><select id="tone" value={tone} onChange={e=>setTone(e.target.value)}><option value="professional">Professional</option><option value="casual">Casual</option><option value="humorous">Humorous</option><option value="inspirational">Inspirational</option><option value="educational">Educational</option><option value="conversational">Conversational</option></select></div>
            <div><Label htmlFor="idea">Core message</Label><Textarea id="idea" value={idea} onChange={e=>setIdea(e.target.value)} rows={6} placeholder="What are you launching, sharing, or teaching? Add the details your audience should know." /></div>
            <div><Label htmlFor="cta">Call to action</Label><Input id="cta" value={cta} onChange={e=>setCta(e.target.value)} placeholder="e.g. Explore the new collection" /></div>
            <fieldset><legend>Target platforms</legend><div className="platform-choices">{availablePlatforms.map(p => {const Icon=platformIcons[p];return <button key={p} type="button" aria-pressed={platforms.includes(p)} onClick={()=>toggle(p)}><Icon className="h-3.5 w-3.5" />{PLATFORM_CONFIGS[p].name}{platforms.includes(p)&&<Check size={11}/>}</button>;})}</div></fieldset>
          </fieldset>
        </section>
        <section className="studio-panel forge-engine" aria-labelledby="engine-title">
          <div className="engine-banner"><span className="eyebrow">✦ ORC INTELLIGENCE</span><h2 id="engine-title">AI Content Engine</h2><p>Your vision. On-brand drafts. Built for each platform.</p></div>
          <div className="engine-actions"><Button onClick={generate} disabled={busy || saving || !idea.trim() || !platforms.length || platforms.includes("TELEGRAM")}>{busy?<Loader2 size={15} className="animate-spin"/>:<Wand2 size={15}/>} {busy?"Forging content…":"Generate variants"}</Button><Button variant="outline" onClick={startManual} disabled={busy || saving || !platforms.length}><PenLine size={14}/>Write manually</Button></div>
          {platforms.includes("TELEGRAM") && <p className="studio-muted px-4">Telegram supports manual drafts here. Deselect it to generate AI variants for the other channels.</p>}
          {variants.length ? <>
            <div className="variant-tabs" role="tablist" aria-label="Platform drafts">{variants.map(v => {const Icon=platformIcons[v.platform];return <button id={`tab-${v.platform}`} aria-controls="variant-editor" role="tab" aria-selected={active===v.platform} key={v.platform} onClick={()=>setActive(v.platform)}><Icon className="h-4 w-4"/>{PLATFORM_CONFIGS[v.platform].name}{saved.includes(v.platform)&&<Check size={13}/>}</button>;})}</div>
            <div className="variant-editor" id="variant-editor" role="tabpanel" aria-labelledby={`tab-${active}`}>
              <div className="editor-meta"><Label htmlFor="variant-content">{PLATFORM_CONFIGS[active].name} draft</Label><span className={(current?.content.length || 0)>limit?"text-destructive":""}>{current?.content.length || 0} / {limit}</span></div>
              <Textarea id="variant-content" value={current?.content || ""} onChange={e=>edit(e.target.value)} disabled={busy || saving || saved.includes(active)} rows={12} placeholder="Write something worth sharing…" />
              <PlatformCharCounts text={current?.content ?? ""} platforms={variants.map((v) => v.platform)} />
              {saved.includes(active)&&<p className="studio-muted">Saved. Continue editing this post in Drafts.</p>}
            </div>
            <div className="engine-actions"><Button onClick={()=>save(false)} disabled={saving || busy || !current?.content.trim() || saved.includes(active)}>{saving&&<Loader2 size={14} className="animate-spin"/>}{saved.includes(active)?"Draft saved":"Save selected draft"}</Button><Button variant="outline" onClick={()=>save(true)} disabled={saving || busy || saved.length===variants.length}>Save all drafts ({variants.length-saved.length})</Button></div>
          </> : <div className="studio-empty forge-empty"><Sparkles size={30}/><h3>Your next great post starts here.</h3><p>Complete your brief and choose your channels.<br/>Generate with AI, or start writing your own draft.</p><div className="empty-channel-icons">{platforms.map(p=>{const Icon=platformIcons[p];return <Icon key={p} className="h-6 w-6"/>;})}</div></div>}
        </section>
        <aside className="studio-panel forge-guidance"><div className="studio-panel-heading"><h2><Sparkles size={16}/> Creative Playbook</h2><p>A few principles for stronger content.</p></div>{[{title:"Lead with a strong hook",text:"Make the first line a reason to stop scrolling."},{title:"Speak to one audience",text:"Use the words and problems your readers recognize."},{title:"Make the next step clear",text:"Give each post one focused call to action."},{title:"Adapt for the channel",text:"Review length, formatting, and tone for every platform."}].map((tip,i)=><div className="guidance-tip" key={tip.title}><span>0{i+1}</span><div><h3>{tip.title}</h3><p>{tip.text}</p></div></div>)}<div className="approval-reminder"><ShieldCheck size={23}/><h3>You give the green light.</h3><p>Saved content stays in Drafts until you submit it for review and approval.</p></div></aside>
      </div>
      <section className="studio-panel previews-panel"><div className="studio-panel-heading"><h2><Check size={16}/> Multi-Platform Preview</h2><p>Text previews update as you edit. Final appearance varies by platform.</p></div><div className="post-previews">{(variants.length?variants:platforms.map(platform=>({platform,content:""}))).map(v=>{const Icon=platformIcons[v.platform];return <article className="social-preview" key={v.platform}><header><Icon className="h-4 w-4"/><strong>{PLATFORM_CONFIGS[v.platform].name}</strong><span>{saved.includes(v.platform)?"Saved":"Draft"}</span></header><div className="social-preview-body"><span className="preview-user">Your brand <span>· Just now</span></span><p>{v.content || "Your content will appear here once you generate or write a draft."}</p></div></article>;})}</div></section>
      <div className="studio-footer"><ShieldCheck size={15}/><span>Draft first. Approve with confidence. Publish on your terms.</span><Link href="/dashboard/drafts">View your drafts <ArrowRight size={13}/></Link></div>
    </div>
  </div>;
}
