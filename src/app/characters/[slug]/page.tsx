import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Sparkles, Volume2 } from "lucide-react";
import { characters, getCharacter } from "@/lib/characters";

export function generateStaticParams() { return characters.map(({ slug }) => ({ slug })); }

export default async function CharacterPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const character = getCharacter(slug);
  if (!character) notFound();
  return <main className="character-world" style={{ "--crew-accent": character.accent, "--crew-glow": character.glow } as React.CSSProperties}>
    <nav className="world-nav site-width"><Link href="/"><ArrowLeft size={16}/> Back to the crew</Link><Link href="/register" className="cta cta-small">Start creating <ArrowRight size={16}/></Link></nav>
    <section className="world-hero site-width">
      <div className="world-image"><img src={character.image} alt={`${character.name}, ${character.role}`} /><div className="world-orb" /></div>
      <div className="world-copy"><span className="world-platform">{character.platform} specialist</span><p className="world-kicker">Your AI creative partner</p><h1>{character.name}</h1><h2>{character.role}</h2><blockquote>“{character.line}”</blockquote><p>{character.intro}</p><div className="world-actions"><Link href="/register" className="cta">Create with {character.name} <ArrowRight size={17}/></Link><span><Volume2 size={16}/> {character.voice}</span></div></div>
    </section>
    <section className="world-details site-width"><article><Sparkles size={22}/><span>PERSONALITY</span><h3>{character.personality}</h3><p>{character.specialty}</p></article><article className="world-missions"><span>WHAT {character.name.toUpperCase()} CAN DO</span><h2>Ready for your next mission.</h2><div>{character.actions.map((action)=><p key={action}><Check size={16}/>{action}</p>)}</div></article></section>
    <section className="world-next site-width"><p>Different platforms. Same mission.</p><Link href={`/characters/${characters[(characters.findIndex(c=>c.slug===slug)+1)%characters.length].slug}`}>Meet the next specialist <ArrowRight size={16}/></Link></section>
  </main>;
}
