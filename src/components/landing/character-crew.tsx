"use client";

import Link from "next/link";
import { ArrowUpRight, Play, Sparkles, Volume2 } from "lucide-react";
import { characters, type Character } from "@/lib/characters";

function speak(character: Character) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(character.intro);
  utterance.rate = 0.94;
  utterance.pitch = character.slug === "tubethor" ? 0.76 : character.slug === "tokster" ? 1.12 : 1;
  window.speechSynthesis.speak(utterance);
}

export function CharacterCrew() {
  return (
    <section className="crew-section site-width" aria-labelledby="crew-title">
      <div className="section-heading crew-heading">
        <div><span className="eyebrow"><Sparkles size={13} /> MEET YOUR CREATIVE CREW</span><h2 id="crew-title">Six specialists.<br />One unstoppable brand.</h2></div>
        <p>Hover to meet them. Hear their voice. Enter their world and create content tuned for every platform.</p>
      </div>
      <div className="crew-grid">
        {characters.map((character) => (
          <article key={character.slug} className="crew-card" style={{ "--crew-accent": character.accent, "--crew-glow": character.glow } as React.CSSProperties}>
            <Link href={`/characters/${character.slug}`} className="crew-visual" aria-label={`Meet ${character.name}`}>
              <img src={character.image} alt={`${character.name}, ${character.role}`} />
              <div className="crew-face" aria-hidden="true"><img src={character.image} alt="" /></div>
              <span className="crew-platform">{character.platform}</span>
              <span className="crew-enter"><Play size={14} fill="currentColor" /> Enter world</span>
            </Link>
            <div className="crew-copy">
              <div><p>{character.role}</p><h3>{character.name}</h3></div>
              <button type="button" className="crew-voice" onClick={() => speak(character)} aria-label={`Hear ${character.name} introduce themselves`}><Volume2 size={15} /> Voice</button>
            </div>
            <p className="crew-line">“{character.line}”</p>
            <Link href={`/characters/${character.slug}`} className="crew-meet">Meet {character.name} <ArrowUpRight size={15} /></Link>
          </article>
        ))}
      </div>
    </section>
  );
}
