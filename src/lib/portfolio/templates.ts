/**
 * Template documents, ported from the design prototype. Content is sample copy
 * that the person replaces; the structure and theme are the template.
 * Ids are deterministic per template so server and client renders agree.
 */
import { makeNode } from "./model";
import type { NodeProps, NodeType, PNode, PortfolioDoc, StyleMap } from "./types";

let seq = 0;
let prefix = "t";
const N = (type: NodeType, props: NodeProps = {}, style: StyleMap = {}, kids: PNode[] = []): PNode => makeNode(type, props, style, kids, `${prefix}${(seq++).toString(36)}`);
const sec = (label: string, st: StyleMap, kids: PNode[], anchor?: string) => N("section", { label, anchor: anchor || "" }, st, kids);
const stk = (st: StyleMap, kids: PNode[]) => N("stack", {}, st, kids);
const grd = (st: StyleMap, kids: PNode[]) => N("grid", {}, st, kids);
const colm = (st: StyleMap, kids: PNode[]) => N("column", {}, st, kids);
const ctn = (st: StyleMap, kids: PNode[]) => N("container", {}, st, kids);
const hd = (text: string, level?: number, st?: StyleMap) => N("heading", { text, level: level || 2 }, st);
const tx = (text: string, st?: StyleMap) => N("text", { text }, st);
const bt = (label: string, href: string, variant?: string, st?: StyleMap) => N("button", { label, href, variant: variant || "filled" }, st);
const im = (src: string | null, alt: string, p?: NodeProps, st?: StyleMap) => N("image", { src, alt, ratio: "4/3", shape: "rect", ...(p || {}) }, st);
const pj = (p: NodeProps, st?: StyleMap) => N("project", { variant: "card", ratio: "4/3", tags: [], ...p }, st);
const ex = (p: NodeProps, st?: StyleMap) => N("experience", { variant: "row", ...p }, st);
const sk = (title: string, items: string[], variant?: string, st?: StyleMap) => N("skills", { title, items, variant: variant || "chips" }, st);
const so = (links: [string, string][], variant?: string, st?: StyleMap) => N("social", { links: links.map(([label, url]) => ({ label, url })), variant: variant || "text" }, st);
const ct = (p: NodeProps, st?: StyleMap) => N("contact", { variant: "card", ...p }, st);
const dv = (st?: StyleMap) => N("divider", {}, st || {});

export const APPROACH_MD ='## Good content is mostly good operations.\n\nMost teams don’t have a writing problem. They have a **pipeline** problem: briefs arrive late, reviews pile up, and nothing ships on Friday.\n\nWhat I usually bring:\n\n- A weekly brief anyone can read in *five minutes*\n- One approval step, with a named owner\n- A voice guide short enough to actually use\n\n> Publish less. Finish more.\n\nI write about this most weeks on [my Substack](https://sarahaugen.substack.com).';
function mkSara(): Omit<PortfolioDoc, "schemaVersion"> & { key: string } {const lab=(num: string,name: string)=>tx(num+'  ·  '+name,{font:'geistmono',size:12,ls:0.08,case:'upper',color:'muted'});
 const heroH=hd('I turn complicated products into stories people finish reading.',1,{size:76,weight:300,lh:1.02,ls:-0.04,maxW:1000});heroH.resp.mobile={size:42};
 const portrait=im('portrait-sara','Sara Haugen, illustrated portrait',{ratio:'4/5'},{width:300,radius:4});portrait.resp.mobile={width:'fill'};
 const lk=(l: string,h: string)=>bt(l,h,'link',{size:14,weight:500,color:'text'});const l1=lk('Work','#work'),l2=lk('Approach','#approach');l1.hide={mobile:true};l2.hide={mobile:true};
 const side=(num: string,name: string)=>colm({width:240,gap:8},[lab(num,name)]);
 return {key:'sara',owner:{name:'Sara Haugen',initials:'SH'},seo:{title:'Sara Haugen — Content lead, Oslo',desc:'Content lead at Fjord Co. Eight years writing and running content for B2B software.'},
 theme:{bg:'#F5F3EF',surface:'#FFFFFF',text:'#17171C',muted:'#62626B',accent:'#2E3E8F',onAccent:'#FFFFFF',line:'rgba(23,23,28,0.12)',fontHead:'hanken',fontBody:'geist',headWeight:300,headLs:-0.035,radius:6,space:1,maxW:1120},
 root:[
  sec('Header',{padY:26},[stk({justify:'between',autoStack:false},[tx('Sara Haugen',{size:15,weight:600,ls:-0.01,color:'text'}),stk({gap:28,autoStack:false},[l1,l2,lk('Contact','#contact')])])]),
  sec('Hero',{padY:88,gap:56},[colm({gap:28},[tx('Content lead  ·  Fjord Co  ·  Oslo',{font:'geistmono',size:12,ls:0.08,case:'upper',color:'accent'}),heroH]),
   stk({gap:64,align:'end',justify:'between'},[colm({gap:28,maxW:560},[tx('Eight years writing and running content for B2B software. I build **editorial calendars that survive real deadlines**, and teams that publish without heroics.',{size:19,lh:1.6,color:'muted'}),stk({gap:24,autoStack:false},[bt('See selected work','#work','filled',{radius:64,padY:13,padX:22}),bt('Download CV','#','link',{color:'text',weight:500})])]),portrait])]),
  sec('Selected work',{padY:72,gap:36},[dv(),stk({justify:'between',autoStack:false},[lab('01','Selected work'),tx('2024 — 2026',{font:'geistmono',size:12,color:'muted'})]),grd({cols:2,gap:32},[
   pj({variant:'overlay',title:'From 2 to 11 posts a week, without hiring',role:'Fjord Co',year:'2025',summary:'Rebuilt the editorial pipeline around **one weekly brief** and a single approval step. Output went up five-fold; review time went down.',img:'pipeline',ratio:'21/9',href:'#'},{span:2,size:19}),
   pj({variant:'overlay',title:'“Planning a year of content”',role:'Webinar series, Fjord Co',year:'2026',summary:'Six live sessions that became our best acquisition channel: 4,100 sign-ups, 31% to trial.',img:'webinar'},{size:17}),
   pj({variant:'overlay',title:'A one-page voice guide',role:'Nordlys Studio',year:'2024',summary:'Principles and before/after rewrites, now part of every new hire’s first week.',img:'voice'},{size:17})])],'work'),
  sec('Approach',{padY:72,gap:36},[dv(),stk({gap:64,align:'start'},[side('02','Approach'),tx(APPROACH_MD,{size:18,lh:1.65,color:'muted',maxW:660})])],'approach'),
  sec('Experience',{padY:72,gap:36},[dv(),stk({gap:64,align:'start'},[side('03','Experience'),colm({gap:0},[
   ex({role:'Content lead',company:'Fjord Co',period:'2023 — now',location:'Oslo',desc:'Own the content calendar across seven channels. Built the approval workflow now used by **twelve people**.'}),
   ex({role:'Senior copywriter',company:'Nordlys Studio',period:'2020 — 2023',location:'Oslo',desc:'Launch copy, websites and naming for more than thirty Nordic startups.'}),
   ex({role:'Communications associate',company:'Oslo Science Park',period:'2017 — 2020',location:'Oslo',desc:'Newsletters, events, and the park’s first podcast.'})])])],'experience'),
  sec('Skills',{padY:72,gap:36},[dv(),stk({gap:64,align:'start'},[side('04','Practice'),colm({gap:28},[sk('Writing',['Long-form','Product copy','Ghostwriting','Editing'],'inline',{size:15}),sk('Strategy',['Editorial calendars','SEO briefs','Channel planning'],'inline',{size:15}),sk('Tools',['SocialOrk','Figma','Notion','GA4'],'inline',{size:15})])])]),
  sec('Contact',{padY:112,gap:36},[dv(),lab('05','Contact'),ct({variant:'split',heading:'Have a story that needs telling?',text:'I take on two freelance projects a quarter alongside my role at Fjord Co. Tell me what you’re working on.',email:'sara@haugen.no',location:'Oslo, Norway',availability:'Booking from January 2027',button:'Email Sara'},{size:18})],'contact'),
  sec('Footer',{padY:28},[stk({justify:'between',autoStack:false},[tx('© 2026 Sara Haugen',{font:'geistmono',size:12,color:'muted'}),so([['LinkedIn','https://linkedin.com/in/sarahaugen'],['Substack','https://sarahaugen.substack.com'],['Instagram','https://instagram.com/sara.writes']],'text',{size:13})])])]};}
function mkLina(): Omit<PortfolioDoc, "schemaVersion"> & { key: string } {const lk=(l: string,h: string)=>bt(l,h,'link',{size:15,weight:400,color:'text'});return {key:'lina',owner:{name:'Lina Haddad',initials:'LH'},seo:{title:'Lina Haddad — Strategy consultant & writer',desc:'Service strategy and discovery for public-sector teams in Norway.'},
 theme:{bg:'#F6F3EC',surface:'#EDE7DB',text:'#1C1B18',muted:'#655F55',accent:'#B4441F',onAccent:'#FFFFFF',line:'rgba(28,27,24,0.14)',fontHead:'hanken',fontBody:'hanken',headWeight:300,headLs:-0.035,radius:0,space:1.1,maxW:960},
 root:[
  sec('Header',{padY:28},[stk({justify:'between',autoStack:false},[tx('Lina Haddad',{size:15,weight:600}),stk({gap:28,autoStack:false},[lk('Work','#work'),lk('Writing','#writing'),lk('Contact','#contact')])])]),
  sec('Introduction',{padY:120,gap:24},[tx('Strategy consultant & writer — Oslo',{size:13,weight:600,ls:0.08,case:'upper',color:'accent'}),hd('I help public-sector teams turn strategy into services people actually use.',1,{size:68,lh:1.04}),tx('For ten years I have worked between policy and delivery: running discovery, shaping service strategy, and writing the documents that get things funded.',{size:20,color:'muted',maxW:620})]),
  sec('Engagements',{padY:72},[hd('Selected engagements',2,{size:13,weight:600,case:'upper',ls:0.08,color:'muted'}),colm({gap:0},[
   ex({period:'2023 — now',role:'Service strategy lead',company:'Norwegian Digitalisation Agency',desc:'Leading strategy for a cross-agency “life events” service, from discovery to a funded three-year roadmap.'}),
   ex({period:'2021 — 2023',role:'Discovery lead',company:'City of Bergen, Welfare services',desc:'Sixty interviews with caseworkers and applicants. The findings reshaped the application flow and cut processing time by a third.'}),
   ex({period:'2016 — 2021',role:'Senior consultant',company:'Halden & Moe',desc:'Strategy and organisational design for municipalities and health trusts.'})])],'work'),
  sec('Writing',{padY:72},[hd('Writing',2,{size:13,weight:600,case:'upper',ls:0.08,color:'muted'}),colm({gap:0},[
   pj({variant:'list',title:'Why most digital strategies stall in year two',year:'2026',summary:'Strategies are written for the budget cycle, not the delivery cycle. Notes on closing that gap.',href:'#',linkLabel:'Read the essay'},{size:18}),
   pj({variant:'list',title:'Designing for the caseworker, not the case',year:'2025',summary:'The people inside the system are users too. What happens when you treat them that way.',href:'#',linkLabel:'Read the essay'},{size:18}),
   pj({variant:'list',title:'A field guide to public-sector discovery',year:'2024',summary:'A practical, 40-page guide now used by four Norwegian agencies.',href:'#',linkLabel:'Download the guide'},{size:18})])],'writing'),
  sec('Practice',{padY:56},[sk('Practice',['Service strategy','Policy design','Discovery research','Facilitation','Organisational design'],'inline')]),
  sec('Contact',{padY:120},[hd('Currently booking engagements from February 2027.',2,{size:44,maxW:720}),stk({gap:28,autoStack:false},[bt('lina@haddad.studio','mailto:lina@haddad.studio','link',{size:18,weight:500}),so([['LinkedIn','https://linkedin.com/in/linahaddad'],['Newsletter','https://haddad.studio/letters']],'text',{size:18})])],'contact')]};}
function mkSindre(): Omit<PortfolioDoc, "schemaVersion"> & { key: string } {const lk=(l: string,h: string)=>bt(l,h,'link',{size:14,weight:400,color:'text'});return {key:'sindre',owner:{name:'Sindre Aas',initials:'SA'},seo:{title:'Sindre Aas — Platform engineer',desc:'Platform engineering, Rust and Postgres, from Bergen.'},
 theme:{bg:'#0D0F0C',surface:'#151913',text:'#D6E3CF',muted:'#8C9985',accent:'#F2B33D',onAccent:'#0D0F0C',line:'rgba(214,227,207,0.14)',fontHead:'geistmono',fontBody:'plex',headWeight:500,headLs:-0.01,radius:4,space:.9,maxW:1040},
 root:[
  sec('Header',{padY:20},[stk({justify:'between',autoStack:false},[tx('~/sindre-aas',{size:14,color:'accent',font:'geistmono'}),stk({gap:20,autoStack:false},[lk('[projects]','#projects'),lk('[log]','#log'),lk('[contact]','#contact')])])]),
  sec('Intro',{padY:96,gap:20},[tx('$ whoami',{size:14,color:'accent',font:'geistmono'}),hd('Sindre Aas — platform engineer. I build the boring infrastructure that lets product teams ship on Fridays.',1,{size:40,lh:1.25,maxW:880}),tx('Staff engineer at Fjordline Logistics in Bergen. Previously Nordpay and Kvist Media. Rust, Go, Postgres, and more YAML than I would like.',{size:16,color:'muted',maxW:660}),stk({gap:16,mt:8,autoStack:false},[bt('Read the log','#log','outline',{size:14}),bt('github.com/sindre-aas','https://github.com','link',{size:14,weight:500})])]),
  sec('Projects',{padY:64},[hd('## projects',2,{size:15,color:'accent',weight:500}),grd({cols:2,gap:16},[
   pj({variant:'outline',title:'kelp',summary:'A 2 MB service-mesh sidecar written in Rust. Handles mTLS and retries for 140 services at Fjordline.',year:'2025',tags:['Rust','mTLS'],href:'#',linkLabel:'repo'}),
   pj({variant:'outline',title:'harbor-ci',summary:'Monorepo CI that only builds what changed. Median pipeline time went from 41 to 6 minutes.',year:'2024',tags:['Go','Bazel'],href:'#',linkLabel:'repo'}),
   pj({variant:'outline',title:'pgshift',summary:'Zero-downtime major-version upgrades for Postgres using logical replication. Used on 30+ clusters.',year:'2023',tags:['Postgres','Go'],href:'#',linkLabel:'write-up'}),
   pj({variant:'outline',title:'fjord-otel',summary:'Opinionated OpenTelemetry presets for teams without an observability engineer.',year:'2023',tags:['OpenTelemetry'],href:'#',linkLabel:'repo'})])],'projects'),
  sec('Log',{padY:64},[hd('## log',2,{size:15,color:'accent',weight:500}),colm({gap:0},[
   ex({period:'2022 → now',role:'Staff platform engineer',company:'Fjordline Logistics',desc:'Own the internal platform: deploys, service mesh, Postgres fleet. Team of five.'}),
   ex({period:'2019 → 2022',role:'Senior engineer, payments infra',company:'Nordpay',desc:'Moved card processing to Kubernetes with zero customer-facing incidents.'}),
   ex({period:'2016 → 2019',role:'Backend engineer',company:'Kvist Media',desc:'Video pipeline, and the first on-call rotation.'})])],'log'),
  sec('Stack',{padY:56},[grd({cols:3,gap:24},[sk('languages',['Rust','Go','TypeScript','SQL'],'list'),sk('infrastructure',['Kubernetes','Terraform','Nix','Postgres'],'list'),sk('practice',['Incident command','SRE','Mentoring'],'list')])]),
  sec('Contact',{padY:88},[ct({variant:'plain',heading:'$ mail sindre@aas.dev',text:'Happy to talk about platform teams, incident reviews or Rust in production. I reply within a week.',email:'sindre@aas.dev',location:'Bergen, NO',availability:'Not looking for a new role',button:''},{size:14}),so([['GitHub','https://github.com'],['Mastodon','https://hachyderm.io'],['RSS','#']],'text',{size:14})],'contact')]};}
function mkMaya(): Omit<PortfolioDoc, "schemaVersion"> & { key: string } {const lk=(l: string,h: string)=>bt(l,h,'link',{size:15,weight:500,color:'text'});const por=im('portrait-maya','Maya Okafor, illustrated portrait',{ratio:'4/5'},{width:400});por.resp.mobile={width:'fill'};
 return {key:'maya',owner:{name:'Maya Okafor',initials:'MO'},seo:{title:'Maya Okafor — Product designer, Lisbon',desc:'Product designer making complex tools feel calm.'},
 theme:{bg:'#FFFFFF',surface:'#F3F3F1',text:'#111111',muted:'#636363',accent:'#2D4BFF',onAccent:'#FFFFFF',line:'rgba(17,17,17,0.1)',fontHead:'geist',fontBody:'geist',headWeight:600,headLs:-0.03,radius:6,space:1,maxW:1280},
 root:[
  sec('Header',{padY:22},[stk({justify:'between',autoStack:false},[tx('Maya Okafor',{size:16,weight:600}),stk({gap:24,autoStack:false},[lk('Work','#work'),lk('About','#about'),lk('Contact','#contact')])])]),
  sec('Intro',{padY:56},[hd('Product designer making complex tools feel calm. Independent, based in Lisbon.',1,{size:46,weight:500,lh:1.08,maxW:900})]),
  sec('Work',{padY:16},[grd({cols:2,gap:20},[
   pj({variant:'overlay',title:'Tidewater',role:'Lead designer',year:'2025',summary:'Redesigned the console 900 port dispatchers use all day. Fewer screens, faster handovers.',img:'tide',ratio:'16/9'},{span:2}),
   pj({variant:'overlay',title:'Kollekt',role:'Product design',year:'2024',summary:'A banking app for collectives, co-ops and shared households.',img:'kollekt'}),
   pj({variant:'overlay',title:'Fieldnote',role:'Design & research',year:'2023',summary:'A research repository that teams actually keep up to date.',img:'fieldnote'}),
   pj({variant:'overlay',title:'Atlas Health',role:'Product design',year:'2022',summary:'Clinic scheduling for 40 practices across Portugal.',img:'atlas',ratio:'21/9'},{span:2})])],'work'),
  sec('About',{padY:96},[stk({gap:56,align:'start'},[por,colm({gap:24},[hd('About',2,{size:13,weight:600,case:'upper',ls:0.08,color:'muted'}),tx('I’ve spent nine years designing tools for people who use them eight hours a day: dispatchers, clinicians, analysts. I like dense problems, plain language and shipping.',{size:22,lh:1.45}),sk('Services',['Product design','Design systems','Research','Prototyping'],'chips'),colm({gap:0},[ex({variant:'stacked',role:'Independent designer',company:'Clients in the EU & UK',period:'2022 — now'}),ex({variant:'stacked',role:'Senior product designer',company:'Marés Software',period:'2018 — 2022'})])])])],'about'),
  sec('Contact',{padY:120},[hd('Let’s make something calm.',2,{size:72,weight:600,ls:-0.045,lh:1}),stk({gap:12,mt:8,autoStack:false},[bt('hello@mayaokafor.design','mailto:hello@mayaokafor.design','filled',{radius:64,size:16,padY:14,padX:24}),so([['Instagram','#'],['Are.na','#'],['LinkedIn','#']],'pills')])],'contact')]};}
function mkOmar(): Omit<PortfolioDoc, "schemaVersion"> & { key: string } {return {key:'omar',owner:{name:'Omar Farouk',initials:'OF'},seo:{title:'Omar Farouk — Founder, Qanat',desc:'Low-cost soil sensors for farmers in the Nile Delta.'},
 theme:{bg:'#B83D0B',surface:'#9E3409',text:'#FFF4E6',muted:'#FFDCC2',accent:'#FFF4E6',onAccent:'#8F2E07',line:'rgba(255,244,230,0.3)',fontHead:'hanken',fontBody:'geist',headWeight:800,headLs:-0.05,radius:64,space:1,maxW:1200},
 root:[
  sec('Hero',{padY:56},[stk({justify:'between',align:'end',gap:40},[hd('OMAR\nFAROUK',1,{size:150,lh:0.86}),colm({width:340,gap:18},[tx('Founder of Qanat. We make low-cost soil sensors that tell farmers in the Nile Delta exactly when to irrigate.',{size:18,lh:1.5}),so([['LinkedIn','#'],['X','#'],['Email','mailto:omar@qanat.eg']],'pills',{size:14})])])]),
  sec('Rule',{padY:0},[dv({bg:'text',thick:2})]),
  sec('Building',{padY:72},[grd({cols:3,gap:40},[hd('Building',2,{size:14,weight:700,case:'upper',ls:0.1,font:'geist'}),colm({gap:0,span:2},[ex({variant:'stacked',role:'Founder & CEO',company:'Qanat',period:'2023 — now · Cairo',desc:'2,300 farms, 18% less water on average. Seed round closing Q1 2027.'},{size:20}),ex({variant:'stacked',role:'Hardware lead',company:'Nilewave Robotics',period:'2019 — 2023',desc:'Shipped three generations of irrigation controllers.'},{size:20})])])]),
  sec('Talks',{padY:40},[grd({cols:3,gap:40},[hd('Talking',2,{size:14,weight:700,case:'upper',ls:0.1,font:'geist'}),colm({gap:0,span:2},[pj({variant:'list',title:'Water is a data problem',year:'2026',summary:'Keynote · Delta AgriTech Forum, Mansoura'},{size:20}),pj({variant:'list',title:'Building hardware in Egypt, honestly',year:'2025',summary:'Panel · Cairo Climate Week'},{size:20}),pj({variant:'list',title:'Sensors under ten dollars',year:'2024',summary:'Workshop · university venture lab'},{size:20})])])]),
  sec('Contact',{padY:88},[ct({variant:'card',heading:'Investors, agronomists, curious engineers: my inbox is open.',text:'',email:'omar@qanat.eg',location:'Cairo, Egypt',availability:'Raising seed, Q1 2027',button:'Write to Omar'})])]};}
function mkResume(): Omit<PortfolioDoc, "schemaVersion"> & { key: string } {const L=(x: string)=>hd(x,2,{size:12,weight:600,case:'upper',ls:0.1,color:'accent',font:'geistmono'});
 return {key:'resume',owner:{name:'Amira Nassar',initials:'AN'},seo:{title:'Amira Nassar — Data analyst',desc:'MSc Statistics graduate looking for analytics roles from June 2027.'},
 theme:{bg:'#FFFFFF',surface:'#F5F7F8',text:'#0F172A',muted:'#556070',accent:'#0E7C66',onAccent:'#FFFFFF',line:'rgba(15,23,42,0.1)',fontHead:'geist',fontBody:'geist',headWeight:600,headLs:-0.03,radius:6,space:.75,maxW:760},
 root:[
  sec('Header',{padY:72,gap:20},[stk({gap:24,justify:'between',autoStack:false},[colm({gap:6},[hd('Amira Nassar',1,{size:40}),tx('Data analyst · MSc Statistics, NTNU · Trondheim',{size:16,color:'muted'})]),im(null,'',{shape:'circle'},{width:88})]),
   tx('**Open to** graduate roles in analytics and data science from June 2027.',{size:15,color:'muted'}),
   so([['amira.nassar@proton.me','mailto:amira.nassar@proton.me'],['LinkedIn','#'],['GitHub','#'],['Download CV (PDF)','#']],'text',{size:14})]),
  sec('Profile',{padY:28,gap:14},[dv(),L('Profile'),tx('I like turning messy operational data into decisions people can act on. My thesis forecasts bed demand for a regional hospital; my internship cut a weekly reporting job from **six hours to twenty minutes**.',{size:17})]),
  sec('Education',{padY:28,gap:4},[dv(),L('Education'),ex({role:'MSc Statistics',company:'NTNU',period:'2025 — 2027',desc:'Thesis: forecasting hospital bed demand with hierarchical time-series models.'}),ex({role:'BSc Mathematics',company:'University of Bergen',period:'2022 — 2025',desc:'Minor in computer science. Graduated with distinction.'})]),
  sec('Experience',{padY:28,gap:4},[dv(),L('Experience'),ex({role:'Data analyst intern',company:'Nordvik Energi',period:'Summer 2026',desc:'Automated the weekly production report in Python and dbt: **6 hours → 20 minutes**.'}),ex({role:'Teaching assistant, Statistics 101',company:'NTNU',period:'2025 — 2026',desc:'Ran weekly exercise sessions for 120 first-year students.'})]),
  sec('Projects',{padY:28,gap:4},[dv(),L('Projects'),pj({variant:'list',title:'Forecasting hospital bed demand',year:'2027',summary:'Master’s thesis. Hierarchical models in R with 14% lower error than the current method.',href:'#',linkLabel:'Read the summary'},{size:15}),pj({variant:'list',title:'Bike-share rebalancing dashboard',year:'2026',summary:'A Power BI dashboard a student volunteer group uses to plan bike moves.',href:'#',linkLabel:'View project'},{size:15}),pj({variant:'list',title:'Trondheim air quality, as open data',year:'2025',summary:'Five years of sensor data, cleaned and published with a short analysis.',href:'#',linkLabel:'GitHub'},{size:15})]),
  sec('Skills',{padY:28,gap:16},[dv(),L('Skills'),grd({cols:3,gap:24},[sk('Analysis',['Python','R','SQL','Statistics'],'chips',{size:14}),sk('Tools',['dbt','Power BI','Git','Excel'],'chips',{size:14}),sk('Languages',['Norwegian','English','Arabic'],'chips',{size:14})])]),
  sec('Footer',{padY:56},[tx('References available on request.',{size:14,color:'muted'})])]};}
function mkCreator(): Omit<PortfolioDoc, "schemaVersion"> & { key: string } {const B_=(l: string,h: string,v: string)=>bt(l,h,v,{size:16,padY:16,padX:22,width:'fill'});const vids=grd({cols:2,gap:14,width:520},[pj({variant:'overlay',title:'The 3-word headline test',role:'1.2M views',year:'',summary:'',img:'reel-a',ratio:'4/5'},{size:14}),pj({variant:'overlay',title:'Why your launch post flopped',role:'860k views',year:'',summary:'',img:'reel-b',ratio:'4/5'},{size:14})]);vids.resp.mobile={cols:2};
 return {key:'creator',owner:{name:'Ines Duarte',initials:'ID'},seo:{title:'Ines Duarte — Marketing that doesn’t feel like marketing',desc:'Short videos, a newsletter and a free course on everyday marketing.'},
 theme:{bg:'#FFF1E8',surface:'#FFFFFF',text:'#2A1A12',muted:'#78594B',accent:'#C93F18',onAccent:'#FFFFFF',line:'rgba(42,26,18,0.12)',fontHead:'hanken',fontBody:'geist',headWeight:800,headLs:-0.035,radius:64,space:1,maxW:1120},
 root:[
  sec('Profile',{padY:72,gap:18,align:'center'},[im('portrait-ines','Ines Duarte, illustrated portrait',{shape:'circle'},{width:120}),hd('Ines Duarte',1,{size:44,ta:'center'}),tx('I make short videos about **marketing that doesn’t feel like marketing**. 180k people learn with me every week.',{size:17,ta:'center',color:'muted',maxW:460}),so([['TikTok','#'],['Instagram','#'],['YouTube','#'],['LinkedIn','#']],'pills',{size:14,ta:'center'})]),
  sec('Links',{padY:8,align:'center'},[colm({width:520,gap:12},[B_('Watch this week’s video','#','filled'),B_('Free course: marketing in 10 minutes a day','#','outline'),B_('Newsletter · 41k readers','#','outline'),B_('Work with me','#contact','outline')])]),
  sec('Recent',{padY:64,gap:20,align:'center'},[hd('Recent videos',2,{size:13,weight:700,case:'upper',ls:0.1,color:'muted',ta:'center',font:'geist'}),vids]),
  sec('Brands',{padY:16,align:'center'},[sk('Brands I’ve worked with',['Lumo Coffee','Bryggen Bikes','Tidal Skin','Norra Books'],'inline',{size:14,ta:'center',width:520})]),
  sec('Contact',{padY:64,align:'center'},[ct({variant:'card',heading:'Brand partnerships',text:'One sponsored video a month, only for products I actually use. Media kit and rates on request.',email:'hello@inesduarte.co',location:'Lisbon',availability:'Booking from February 2027',button:'Get the media kit'},{size:14,width:520})],'contact')]};}
function mkStudio(): Omit<PortfolioDoc, "schemaVersion"> & { key: string } {const lab=(x: string)=>tx(x,{font:'geistmono',size:12,ls:0.1,case:'upper',color:'muted'});
 const svc=(a: string,d: string,pr: string)=>ctn({padY:28,padX:28,bg:'surface',gap:12,radius:12},[hd(a,3,{size:20}),tx(d,{size:15,color:'muted'}),tx(pr,{font:'geistmono',size:13,color:'accent'})]);
 const step=(n: string,a: string,d: string)=>colm({gap:10},[tx(n,{font:'geistmono',size:13,color:'accent'}),hd(a,3,{size:19}),tx(d,{size:15,color:'muted'})]);
 return {key:'studio',owner:{name:'Kasper Holm',initials:'KH'},seo:{title:'Kasper Holm — Conversion & analytics consultant',desc:'I help online shops turn more visitors into customers.'},
 theme:{bg:'#151412',surface:'#1F1D1A',text:'#F1ECE4',muted:'#A8A195',accent:'#E0975A',onAccent:'#151412',line:'rgba(241,236,228,0.12)',fontHead:'geist',fontBody:'geist',headWeight:600,headLs:-0.035,radius:10,space:1,maxW:1160},
 root:[
  sec('Header',{padY:20,sticky:true},[stk({justify:'between',autoStack:false},[tx('Kasper Holm',{size:15,weight:600}),bt('Book a call','#contact','filled',{size:14,padY:10,padX:16})])]),
  sec('Hero',{padY:104,gap:28},[lab('Independent · Copenhagen'),hd('I help online shops turn more visitors into customers.',1,{size:68,maxW:920,lh:1.02}),tx('Conversion and analytics consultant. **37 shops** so far, with an average 22% lift in checkout conversion.',{size:19,color:'muted',maxW:620}),stk({gap:12,mt:8,autoStack:false},[bt('Book a 20-minute call','#contact','filled',{padY:14,padX:22}),bt('See results','#results','outline',{padY:14,padX:22})])]),
  sec('Services',{padY:72,gap:28},[lab('Services'),grd({cols:3,gap:16},[svc('Conversion audit','Two weeks. A ranked list of fixes for your store, each with its expected impact.','From €4,800'),svc('Analytics setup','Tracking you can trust: events, funnels and one dashboard your team will open.','From €3,200'),svc('Testing retainer','Two to four A/B tests a month, run and reported. Cancel any month.','€2,900 / month')])]),
  sec('Process',{padY:72,gap:28},[lab('How it works'),grd({cols:4,gap:32},[step('01','Diagnose','Analytics, session recordings and five customer calls.'),step('02','Prioritise','Every fix ranked by impact and effort.'),step('03','Test','Changes go live as experiments, not guesses.'),step('04','Hand over','Your team keeps the playbook and the dashboard.')])]),
  sec('Results',{padY:72,gap:28},[lab('Results'),grd({cols:3,gap:16},[pj({variant:'outline',title:'Bryggen Bikes',year:'+31% checkout',summary:'Checkout cut from five steps to two, and no more surprise shipping costs.',tags:['Shopify']}),pj({variant:'outline',title:'Norra Books',year:'+18% revenue per visitor',summary:'Search and recommendations rebuilt around what readers actually type.',tags:['Search']}),pj({variant:'outline',title:'Tidal Skin',year:'−40% returns',summary:'Clearer shade guides and a quiz that sends people to the right product.',tags:['UX writing']})])],'results'),
  sec('Contact',{padY:104},[ct({variant:'split',heading:'Have a shop that should sell more?',text:'Tell me about your store. I reply within two working days, including when I can’t help.',email:'kasper@holm.co',location:'Copenhagen, Denmark',availability:'Two openings in Q1 2027',button:'Book a 20-minute call'},{size:18})],'contact')]};}
function mkBlank(): Omit<PortfolioDoc, "schemaVersion"> & { key: string } {return {key:'blank',owner:{name:'Sara Haugen',initials:'SH'},seo:{title:'Sara Haugen',desc:''},theme:{bg:'#FFFFFF',surface:'#F4F4F5',text:'#16161A',muted:'#5F5F6B',accent:'#16161A',onAccent:'#FFFFFF',line:'rgba(22,22,26,0.12)',fontHead:'hanken',fontBody:'hanken',headWeight:600,headLs:-0.025,radius:8,space:1,maxW:1120},root:[]};}

type Builder = () => Omit<PortfolioDoc, "schemaVersion"> & { key: string };
function build(key: string, fn: Builder): PortfolioDoc {
  seq = 0;
  prefix = key.slice(0, 3);
  const { key: _k, ...rest } = fn();
  void _k;
  return { schemaVersion: 1, ...rest };
}

export interface TemplateInfo {
  id: string;
  name: string;
  persona?: string;
  fonts: string;
  desc: string;
  audience: string;
  tags: string[];
  make: () => PortfolioDoc;
}

export const TEMPLATES: TemplateInfo[] = [
  { id: "blank", name: "Blank canvas", fonts: "Your choice", desc: "An empty page. Add sections and design everything yourself.", audience: "For anyone who knows what they want", tags: [], make: () => build("blank", mkBlank) },
  { id: "stone", name: "Stone", persona: "Sara Haugen", fonts: "Hanken Grotesk · Geist", desc: "Quiet and elegant: numbered sections, light headlines, Markdown-friendly writing.", audience: "Marketers, writers, content leads", tags: ["writers"], make: () => build("stone", mkSara) },
  { id: "editorial", name: "Editorial", persona: "Lina Haddad", fonts: "Hanken Grotesk", desc: "Typography-led and quiet. Strong hierarchy, lots of air, writing up front.", audience: "Writers, consultants, advisors", tags: ["writers", "freelance"], make: () => build("editorial", mkLina) },
  { id: "terminal", name: "Terminal", persona: "Sindre Aas", fonts: "Geist Mono · IBM Plex Mono", desc: "Monospace details, structured logs and project cards. Dark by default.", audience: "Developers and engineers", tags: ["dev"], make: () => build("terminal", mkSindre) },
  { id: "gallery", name: "Gallery", persona: "Maya Okafor", fonts: "Geist", desc: "Visual-first: large project imagery, short captions, a calm frame.", audience: "Designers and creative professionals", tags: ["design"], make: () => build("gallery", mkMaya) },
  { id: "studio", name: "Studio", persona: "Kasper Holm", fonts: "Geist", desc: "Services, process, results and a booking call to action. Dark and warm.", audience: "Freelancers and consultants", tags: ["freelance"], make: () => build("studio", mkStudio) },
  { id: "bold", name: "Bold", persona: "Omar Farouk", fonts: "Hanken Grotesk · Geist", desc: "Huge type, saturated colour and pill buttons. Hard to scroll past.", audience: "Founders and speakers", tags: ["founders"], make: () => build("bold", mkOmar) },
  { id: "resume", name: "Résumé", persona: "Amira Nassar", fonts: "Geist · Geist Mono", desc: "A one-column CV that reads well on a phone and prints cleanly.", audience: "Students and job seekers", tags: ["students"], make: () => build("resume", mkResume) },
  { id: "creator", name: "Creator", persona: "Ines Duarte", fonts: "Hanken Grotesk · Geist", desc: "A centred link-in-bio page: big buttons, recent videos, partnerships.", audience: "Creators and educators", tags: ["creators"], make: () => build("creator", mkCreator) },
];

export const TEMPLATE_FILTERS: [string, string][] = [["all", "All"], ["writers", "Writers & marketers"], ["dev", "Developers"], ["design", "Designers"], ["freelance", "Freelancers"], ["founders", "Founders"], ["students", "Students"], ["creators", "Creators"]];

export function templateById(id: string): TemplateInfo | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

/** Swap the template's sample name for the person's own, everywhere it appears. */
export function personalise(doc: PortfolioDoc, persona: string | undefined, name: string): PortfolioDoc {
  const owner = { name, initials: name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?" };
  if (!persona || !name.trim()) return { ...doc, owner };
  const up = persona.toUpperCase();
  const swap = (v: string) => v.split(persona).join(name).split(up.replace(" ", "\n")).join(name.toUpperCase().replace(" ", "\n")).split(up).join(name.toUpperCase());
  const visit = (list: PNode[]) => list.forEach((n) => {
    for (const k of ["text", "label", "heading", "alt", "title"] as const) {
      const v = n.props[k];
      if (typeof v === "string") n.props[k] = swap(v);
    }
    visit(n.kids);
  });
  const copy: PortfolioDoc = JSON.parse(JSON.stringify(doc));
  visit(copy.root);
  return { ...copy, owner, seo: { title: swap(copy.seo.title), desc: copy.seo.desc } };
}

export const THEME_PRESETS: { name: string; theme: Partial<PortfolioDoc["theme"]> }[] = [
  { name: "Stone", theme: { bg: "#F5F3EF", surface: "#FFFFFF", text: "#17171C", muted: "#62626B", accent: "#2E3E8F", onAccent: "#FFFFFF", line: "rgba(23,23,28,0.12)", fontHead: "hanken", fontBody: "geist", headWeight: 300, headLs: -0.035 } },
  { name: "Paper", theme: { bg: "#F6F3EC", surface: "#EDE7DB", text: "#1C1B18", muted: "#655F55", accent: "#B4441F", onAccent: "#FFFFFF", line: "rgba(28,27,24,0.14)", fontHead: "hanken", fontBody: "hanken", headWeight: 300, headLs: -0.035 } },
  { name: "Ink", theme: { bg: "#0D0F0C", surface: "#151913", text: "#D6E3CF", muted: "#8C9985", accent: "#F2B33D", onAccent: "#0D0F0C", line: "rgba(214,227,207,0.14)", fontHead: "geistmono", fontBody: "plex", headWeight: 500, headLs: -0.01 } },
  { name: "Gallery", theme: { bg: "#FFFFFF", surface: "#F3F3F1", text: "#111111", muted: "#636363", accent: "#2D4BFF", onAccent: "#FFFFFF", line: "rgba(17,17,17,0.1)", fontHead: "geist", fontBody: "geist", headWeight: 600, headLs: -0.03 } },
  { name: "Clay", theme: { bg: "#B83D0B", surface: "#9E3409", text: "#FFF4E6", muted: "#FFDCC2", accent: "#FFF4E6", onAccent: "#8F2E07", line: "rgba(255,244,230,0.3)", fontHead: "hanken", fontBody: "geist", headWeight: 800, headLs: -0.05 } },
  { name: "Night", theme: { bg: "#131317", surface: "#1B1B21", text: "#EDEDF1", muted: "#A6A6B0", accent: "#48ED85", onAccent: "#06140B", line: "rgba(237,237,241,0.12)", fontHead: "geist", fontBody: "geist", headWeight: 600, headLs: -0.03 } },
];
