import Link from "next/link";
import { CheckCircle2, Calendar, Wand2, Shield } from "lucide-react";
import { 
  LinkedInIcon, 
  TwitterIcon, 
  InstagramIcon, 
  FacebookIcon, 
  YouTubeIcon, 
  TikTokIcon 
} from "@/components/icons/platform-icons";

export default function HomePage() {
  return (
    <div className="flex flex-col min-h-screen">
      <header className="border-b">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold">
              S
            </div>
            <span className="text-xl font-bold">SocialOrc</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link 
              href="/login"
              className="inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              Sign in
            </Link>
            <Link 
              href="/register"
              className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="py-20 px-4">
          <div className="container mx-auto max-w-4xl text-center">
            <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
              Smart Social Media Scheduling with{" "}
              <span className="text-primary">Human Approval</span>
            </h1>
            <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
              Draft content with AI assistance, review and approve before publishing, 
              and schedule posts across all your platforms. Nothing goes live without your explicit approval.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link 
                href="/register"
                className="inline-flex items-center justify-center rounded-lg bg-primary px-6 py-3 text-base font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Start Free
              </Link>
              <Link 
                href="/login"
                className="inline-flex items-center justify-center rounded-lg border px-6 py-3 text-base font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                Sign In
              </Link>
            </div>
          </div>
        </section>

        <section className="py-16 px-4 bg-muted/50">
          <div className="container mx-auto max-w-6xl">
            <h2 className="text-center text-2xl font-bold mb-12">
              One Platform for All Your Social Media
            </h2>
            <div className="flex flex-wrap items-center justify-center gap-8">
              <div className="flex items-center gap-2 text-muted-foreground">
                <LinkedInIcon className="h-8 w-8 text-[#0A66C2]" />
                <span className="font-medium">LinkedIn</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <TwitterIcon className="h-8 w-8" />
                <span className="font-medium">X (Twitter)</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <InstagramIcon className="h-8 w-8 text-[#E4405F]" />
                <span className="font-medium">Instagram</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <FacebookIcon className="h-8 w-8 text-[#1877F2]" />
                <span className="font-medium">Facebook</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <YouTubeIcon className="h-8 w-8 text-[#FF0000]" />
                <span className="font-medium">YouTube</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <TikTokIcon className="h-8 w-8" />
                <span className="font-medium">TikTok</span>
              </div>
            </div>
          </div>
        </section>

        <section className="py-20 px-4">
          <div className="container mx-auto max-w-6xl">
            <h2 className="text-center text-3xl font-bold mb-12">
              How It Works
            </h2>
            <div className="grid md:grid-cols-4 gap-8">
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <Wand2 className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">1. Draft with AI</h3>
                <p className="text-sm text-muted-foreground">
                  Describe your idea and get platform-optimized content variants instantly
                </p>
              </div>
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <CheckCircle2 className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">2. Review & Approve</h3>
                <p className="text-sm text-muted-foreground">
                  Edit, refine, and explicitly approve each post before it can be scheduled
                </p>
              </div>
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <Calendar className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">3. Schedule</h3>
                <p className="text-sm text-muted-foreground">
                  Pick the perfect time with best-time suggestions for each platform
                </p>
              </div>
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <Shield className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">4. Publish Safely</h3>
                <p className="text-sm text-muted-foreground">
                  Your content publishes automatically at the scheduled time
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="py-20 px-4 bg-muted/50">
          <div className="container mx-auto max-w-4xl text-center">
            <h2 className="text-3xl font-bold mb-6">
              Ready to Take Control?
            </h2>
            <p className="text-lg text-muted-foreground mb-8">
              Stop worrying about accidental posts. SocialOrc ensures nothing 
              goes live without your explicit approval.
            </p>
            <Link 
              href="/register"
              className="inline-flex items-center justify-center rounded-lg bg-primary px-6 py-3 text-base font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Get Started Free
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} SocialOrc. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
