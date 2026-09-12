"use client";

import { Suspense, useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, Loader2 } from "lucide-react";
import { RoleSwitcher } from "@/components/dev/role-switcher";
import { isDevRoleLoginVisible } from "@/lib/dev-login";
import { OrcMark } from "@/components/icons/orc-mark";

/** Turn NextAuth's error codes into something a human can act on. */
function messageForError(error: string | null): string | null {
  if (!error) return null;

  switch (error) {
    case "CredentialsSignin":
      return "Invalid email or password.";
    case "MissingCSRF":
      return "Your browser dropped the sign-in cookie. Make sure NEXTAUTH_URL matches the address you are browsing (for local dev: http://localhost:3000) and try again.";
    case "SessionRequired":
      return "Please sign in to continue.";
    default:
      return `Sign-in failed (${error}). Check the server log for details.`;
  }
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Fast-login buttons are driven by what NextAuth can actually serve, so a
  // provider without credentials never renders a button that cannot work.
  const [oauth, setOauth] = useState<Array<{ id: string; label: string }>>([]);

  useEffect(() => {
    let cancelled = false;
    const LABELS: Record<string, string> = {
      google: "Continue with Google",
      facebook: "Continue with Facebook",
    };
    const ORDER = ["google", "facebook"];

    fetch("/api/auth/providers")
      .then((res) => (res.ok ? res.json() : {}))
      .then((data: Record<string, unknown>) => {
        if (cancelled) return;
        setOauth(
          ORDER.filter((id) => Boolean(data?.[id])).map((id) => ({ id, label: LABELS[id] })),
        );
      })
      .catch(() => {
        /* leave them hidden — a button that cannot work is worse than none */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";
  const justRegistered = searchParams.get("registered") === "true";
  const urlError = messageForError(searchParams.get("error"));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const result = await signIn("credentials", {
        // The API stores emails lower-cased; match that or the lookup misses.
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
        callbackUrl,
      });

      if (result?.error) {
        setError(messageForError(result.error) ?? "Invalid email or password.");
      } else {
        router.push(callbackUrl);
        router.refresh();
      }
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {isDevRoleLoginVisible() && (
        <CardContent className="quick-login-panel pb-4">
          <Suspense fallback={null}>
            <RoleSwitcher callbackUrl={callbackUrl} />
          </Suspense>
          <Separator className="mt-4" />
          <p className="mt-3 text-center text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Or sign in with email</p>
        </CardContent>
      )}
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {justRegistered && (
            <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Account created. Sign in to continue.</span>
            </div>
          )}

          {(error || urlError) && (
            <div
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
            >
              {error || urlError}
            </div>
          )}

          {oauth.length > 0 && (
            <>
              {oauth.map((provider) => (
                <Button
                  key={provider.id}
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={loading}
                  onClick={() => {
                    setLoading(true);
                    void signIn(provider.id, { callbackUrl });
                  }}
                >
                  {provider.label}
                </Button>
              ))}
              <div className="relative py-1">
                <Separator />
                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs uppercase text-muted-foreground">
                  or
                </span>
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-4">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Sign in
          </Button>

          <p className="text-sm text-muted-foreground text-center">
            Don&apos;t have an account?{" "}
            <Link href="/register" className="text-primary hover:underline">
              Sign up
            </Link>
          </p>
        </CardFooter>
      </form>

    </>
  );
}

function LoginFormFallback() {
  return (
    <CardContent className="space-y-4">
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    </CardContent>
  );
}

export default function LoginPage() {
  return (
    <Card>
      <CardHeader className="text-center">
        <div className="flex justify-center mb-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <OrcMark className="h-9 w-8" />
          </div>
        </div>
        <CardTitle className="text-2xl">Welcome back</CardTitle>
        <CardDescription>Sign in to your SocialOrc account</CardDescription>
      </CardHeader>

      <Suspense fallback={<LoginFormFallback />}>
        <LoginForm />
      </Suspense>
    </Card>
  );
}
