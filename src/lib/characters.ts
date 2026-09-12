export type Character = {
  slug: string;
  name: string;
  platform: string;
  role: string;
  image: string;
  accent: string;
  glow: string;
  personality: string;
  specialty: string;
  voice: string;
  line: string;
  intro: string;
  actions: string[];
};

export const characters: Character[] = [
  { slug: "instanova", name: "InstaNova", platform: "Instagram", role: "The Visual Storyteller", image: "/characters/instanova.png", accent: "#f62c91", glow: "246 44 145", personality: "Creative, trendy, positive", specialty: "Reels, stories, carousels and brand aesthetics", voice: "Warm, energetic and friendly", line: "Turn ideas into scroll-stopping moments.", intro: "Hey, I’m InstaNova. Let’s turn your next idea into something your audience cannot scroll past.", actions: ["Shape a visual story", "Create a Reel concept", "Build a carousel", "Polish your aesthetic"] },
  { slug: "tokster", name: "TokSter", platform: "TikTok", role: "The Trend Hunter", image: "/characters/tokster.png", accent: "#ff315d", glow: "255 49 93", personality: "Fun, bold, energetic", specialty: "Short videos, trends, challenges and viral hooks", voice: "Youthful, upbeat and playful", line: "Let’s make something go viral.", intro: "Yo, I’m TokSter. I hunt trends, sharpen hooks, and turn quick ideas into big impact.", actions: ["Find a fresh trend", "Write a viral hook", "Plan a challenge", "Create a short script"] },
  { slug: "tubethor", name: "TubeThor", platform: "YouTube", role: "The Long-Form Creator", image: "/characters/tubethor.png", accent: "#ff3030", glow: "255 48 48", personality: "Knowledgeable, inspiring, supportive", specialty: "Long-form videos, tutorials, reviews and storytelling", voice: "Deep, warm and confident", line: "Create. Educate. Inspire.", intro: "I’m TubeThor. Bring me the spark, and together we’ll forge it into a story worth watching.", actions: ["Outline a video", "Write a strong intro", "Plan a tutorial", "Improve retention"] },
  { slug: "linkluna", name: "LinkLuna", platform: "LinkedIn", role: "The Professional Connector", image: "/characters/linkluna.png", accent: "#2487ff", glow: "36 135 255", personality: "Smart, supportive, insightful", specialty: "Thought leadership, networking and career growth", voice: "Calm, clear and professional", line: "Your ideas deserve a bigger audience.", intro: "Hello, I’m LinkLuna. Let’s give your expertise a clear voice and connect it with the right people.", actions: ["Draft a thought piece", "Write a founder story", "Build authority", "Start a conversation"] },
  { slug: "xeno", name: "Xeno", platform: "X / Twitter", role: "The Real-Time Catalyst", image: "/characters/xeno.png", accent: "#e8eef5", glow: "160 177 195", personality: "Witty, sharp, curious", specialty: "Real-time engagement, news, discussions and trends", voice: "Casual, clever and energetic", line: "Join the conversation. Move the world.", intro: "I’m Xeno. Tell me what matters and I’ll help you enter the conversation with speed and substance.", actions: ["React to a trend", "Build a thread", "Sharpen a reply", "Track the conversation"] },
  { slug: "orci", name: "Orci", platform: "SocialOrc", role: "The Community Builder", image: "/characters/orci.png", accent: "#35d779", glow: "53 215 121", personality: "Friendly, motivating, inclusive", specialty: "Community, gamification and cross-platform growth", voice: "Cheerful, warm and epic", line: "Different platforms. One crew.", intro: "Welcome, creator. I’m Orci. I keep the crew together and turn audience participation into real community.", actions: ["Plan a community quest", "Reward engagement", "Connect every channel", "Grow loyal fans"] },
];

export function getCharacter(slug: string) {
  return characters.find((character) => character.slug === slug);
}
