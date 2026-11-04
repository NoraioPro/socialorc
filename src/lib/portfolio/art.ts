/**
 * Sample artwork used by the templates (and offered in the image picker), so a
 * fresh portfolio never shows broken images. Real portfolios use uploaded media.
 * Constant SVG written by us: never user input.
 */
let DOTS = "";
for(let y=24;y<274;y+=22)for(let x=18;x<200;x+=22)DOTS+='<circle cx="'+x+'" cy="'+y+'" r="2.2"/>';
let CAL = "";
for(let c=0;c<5;c++)for(let r=0;r<4;r++){if((c*3+r)%4===1)continue;CAL+='<rect x="'+(240+c*70)+'" y="'+(96+r*30)+'" width="62" height="22" rx="4" fill="'+(['#1F6F50','#7BB39A','#E8A33D','#1F6F50'][(c+r)%4])+'" opacity="'+((c+r)%3?0.85:0.5)+'"/>';}
const ART: Record<string, { vb: string; name: string; s: string }> = {
 'portrait-sara':{vb:'0 0 300 375',name:'Portrait (Sara)',s:'<rect width="300" height="375" fill="#DCD6CB"/><rect y="268" width="300" height="107" fill="#D2CBBE"/><circle cx="238" cy="70" r="24" fill="#F5F3EF" opacity=".8"/><circle cx="150" cy="152" r="58" fill="#17171C"/><path d="M40 375c8-96 56-150 110-150s102 54 110 150z" fill="#2E3E8F"/><path d="M122 226h56l-28 36z" fill="#F5F3EF"/>'},
 'portrait-ines':{vb:'0 0 300 300',name:'Portrait (Ines)',s:'<rect width="300" height="300" fill="#F7B9A0"/><circle cx="236" cy="62" r="18" fill="#FFF1E8" opacity=".7"/><circle cx="150" cy="132" r="52" fill="#2A1A12"/><circle cx="150" cy="100" r="48" fill="#2A1A12"/><path d="M50 300c10-80 50-118 100-118s90 38 100 118z" fill="#D9481F"/>'},
 'reel-a':{vb:'0 0 240 300',name:'Video thumbnail',s:'<rect width="240" height="300" fill="#2A1A12"/><circle cx="168" cy="92" r="58" fill="#D9481F"/><path d="M158 72l28 20-28 20z" fill="#FFF1E8"/><rect x="24" y="172" width="156" height="18" rx="3" fill="#FFF1E8"/><rect x="24" y="198" width="112" height="18" rx="3" fill="#FFF1E8"/><rect x="24" y="224" width="132" height="18" rx="3" fill="#F7B9A0"/>'},
 'reel-b':{vb:'0 0 240 300',name:'Chart thumbnail',s:'<rect width="240" height="300" fill="#F4C9B4"/><rect x="28" y="40" width="184" height="128" rx="10" fill="#FFFFFF"/><rect x="44" y="58" width="80" height="10" rx="5" fill="#2A1A12"/><path d="M46 96l34 10 26-6 34 40 32 12" fill="none" stroke="#D9481F" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><rect x="28" y="196" width="168" height="18" rx="3" fill="#2A1A12"/><rect x="28" y="222" width="120" height="18" rx="3" fill="#2A1A12"/>'},
 voice:{vb:'0 0 400 300',name:'Voice guide',s:'<rect width="400" height="300" fill="#E4DFD4"/><rect x="128" y="34" width="164" height="232" rx="3" fill="#FBFAF7"/><rect x="118" y="44" width="164" height="232" rx="3" fill="#FBFAF7" opacity=".55"/><path d="M150 84c0-14 8-22 20-24v8c-6 2-9 6-9 12h9v18h-20zM180 84c0-14 8-22 20-24v8c-6 2-9 6-9 12h9v18h-20z" fill="#2E3E8F"/><g fill="#17171C"><rect x="150" y="124" width="116" height="7" rx="3.5"/><rect x="150" y="140" width="92" height="7" rx="3.5"/></g><g fill="#17171C" opacity=".22"><rect x="150" y="170" width="112" height="5" rx="2.5"/><rect x="150" y="182" width="100" height="5" rx="2.5"/><rect x="150" y="194" width="108" height="5" rx="2.5"/><rect x="150" y="218" width="84" height="5" rx="2.5"/><rect x="150" y="230" width="96" height="5" rx="2.5"/></g>'},
 'portrait-maya':{vb:'0 0 300 375',name:'Portrait (Maya)',s:'<rect width="300" height="375" fill="#D9CBB8"/><rect y="250" width="300" height="125" fill="#CDBDA7"/><circle cx="150" cy="150" r="58" fill="#2B2118"/><circle cx="150" cy="106" r="46" fill="#2B2118"/><path d="M48 375c10-92 52-146 102-146s92 54 102 146z" fill="#2D4BFF"/>'},
 pipeline:{vb:'0 0 400 300',name:'Pipeline diagram',s:'<rect width="400" height="300" fill="#DCE1F4"/><path d="M60 150H340" stroke="#141A33" stroke-width="2" stroke-dasharray="3 9" stroke-linecap="round"/><circle cx="92" cy="150" r="30" fill="#141A33"/><circle cx="200" cy="150" r="30" fill="#3346D3"/><path d="M186 151l9 9 17-18" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><rect x="276" y="92" width="80" height="116" rx="12" fill="#fff"/><rect x="290" y="110" width="52" height="8" rx="4" fill="#3346D3"/><rect x="290" y="128" width="40" height="6" rx="3" fill="#141A33" opacity=".25"/><rect x="290" y="142" width="46" height="6" rx="3" fill="#141A33" opacity=".25"/><rect x="290" y="156" width="30" height="6" rx="3" fill="#141A33" opacity=".25"/><rect x="80" y="138" width="24" height="24" rx="5" fill="none" stroke="#DCE1F4" stroke-width="3"/>'},
 webinar:{vb:'0 0 400 300',name:'Webinar still',s:'<rect width="400" height="300" fill="#141A33"/><rect x="60" y="44" width="280" height="176" rx="14" fill="#222A55"/><circle cx="200" cy="118" r="34" fill="#C9D1EE"/><path d="M136 220c8-44 120-44 128 0z" fill="#3346D3"/><rect x="76" y="60" width="54" height="18" rx="9" fill="#E5484D"/><circle cx="88" cy="69" r="4" fill="#fff"/><rect x="60" y="238" width="150" height="8" rx="4" fill="#EEF0F6" opacity=".7"/><rect x="60" y="254" width="96" height="8" rx="4" fill="#EEF0F6" opacity=".35"/>'},
 tide:{vb:'0 0 640 360',name:'Port console',s:'<rect width="640" height="360" fill="#0E2A3B"/><g fill="none" stroke="#4FB3BF" stroke-width="2" opacity=".55"><path d="M0 262c80-30 160 30 240 0s160-30 240 0 120 20 160 0"/><path d="M0 292c80-30 160 30 240 0s160-30 240 0 120 20 160 0"/><path d="M0 322c80-30 160 30 240 0s160-30 240 0 120 20 160 0"/></g><rect x="140" y="52" width="360" height="190" rx="10" fill="#F2E9DC"/><rect x="140" y="52" width="360" height="28" rx="10" fill="#E3D6C3"/><g fill="#0E2A3B"><rect x="158" y="98" width="96" height="10" rx="3"/><rect x="158" y="118" width="70" height="8" rx="3" opacity=".35"/><rect x="158" y="134" width="84" height="8" rx="3" opacity=".35"/><rect x="158" y="150" width="60" height="8" rx="3" opacity=".35"/><rect x="158" y="190" width="84" height="30" rx="5" opacity=".9"/></g><rect x="276" y="96" width="206" height="128" rx="6" fill="#fff"/><path d="M290 200l34-30 30 18 40-46 40 26 32-24" fill="none" stroke="#E07A3F" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="434" cy="168" r="5" fill="#E07A3F"/>'},
 kollekt:{vb:'0 0 400 300',name:'Banking app',s:'<rect width="400" height="300" fill="#F4D35E"/><circle cx="148" cy="160" r="92" fill="#EE6C4D"/><circle cx="262" cy="138" r="70" fill="#293241"/><rect x="214" y="92" width="96" height="156" rx="16" fill="#FFFDF5"/><rect x="228" y="112" width="40" height="8" rx="4" fill="#293241"/><rect x="228" y="130" width="68" height="22" rx="5" fill="#EE6C4D"/><rect x="228" y="164" width="68" height="6" rx="3" fill="#293241" opacity=".25"/><rect x="228" y="178" width="52" height="6" rx="3" fill="#293241" opacity=".25"/><rect x="228" y="192" width="60" height="6" rx="3" fill="#293241" opacity=".25"/>'},
 fieldnote:{vb:'0 0 400 300',name:'Research cards',s:'<rect width="400" height="300" fill="#E9E4DA"/><rect x="104" y="70" width="170" height="120" rx="8" fill="#111" transform="rotate(-8 189 130)"/><rect x="128" y="88" width="170" height="120" rx="8" fill="#2D4BFF" transform="rotate(4 213 148)"/><rect x="140" y="104" width="170" height="120" rx="8" fill="#fff"/><rect x="156" y="122" width="80" height="8" rx="4" fill="#111"/><rect x="156" y="140" width="130" height="6" rx="3" fill="#111" opacity=".25"/><rect x="156" y="154" width="110" height="6" rx="3" fill="#111" opacity=".25"/><rect x="156" y="190" width="44" height="18" rx="9" fill="#2D4BFF" opacity=".15"/><rect x="206" y="190" width="56" height="18" rx="9" fill="#111" opacity=".08"/>'},
 atlas:{vb:'0 0 640 274',name:'Clinic schedule',s:'<rect width="640" height="274" fill="#CFE3D4"/><g fill="#1F6F50" opacity=".35">'+DOTS+'</g><rect x="88" y="77" width="40" height="120" rx="6" fill="#1F6F50"/><rect x="48" y="117" width="120" height="40" rx="6" fill="#1F6F50"/><rect x="224" y="44" width="384" height="190" rx="12" fill="#F6FBF7"/><rect x="240" y="62" width="120" height="12" rx="4" fill="#1F6F50"/>'+CAL}
};

export const ART_KEYS = Object.keys(ART);
export const artName = (key: string) => ART[key]?.name ?? key;

const uriCache: Record<string, string> = {};
/** `data:` URI for an artwork key, or null when the key is unknown. */
export function artUri(key: string): string | null {
  const a = ART[key];
  if (!a) return null;
  if (!uriCache[key]) {
    uriCache[key] = "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${a.vb}" preserveAspectRatio="xMidYMid slice">${a.s}</svg>`);
  }
  return uriCache[key];
}

/**
 * What an image field may point at: our sample art, an https URL (uploaded
 * media lives on Vercel Blob), or, in development only, a data: image.
 */
export function imageSrc(value: string | null | undefined): string | null {
  if (!value) return null;
  const art = artUri(value);
  if (art) return art;
  if (/^https:\/\//i.test(value)) return value;
  if (/^data:image\/(png|jpe?g|gif|webp|avif);base64,/i.test(value)) return value;
  return null;
}
