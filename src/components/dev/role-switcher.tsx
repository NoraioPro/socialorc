"use client";

import { useCallback, useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, ShieldCheck, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isRole, type Role } from "@/lib/roles";
import { devRoleOptions } from "@/lib/dev-login";

interface RoleSwitcherProps {
  /** Callback target after a successful role login. */
  callbackUrl?: string;
}

/**
 * Dev-only quick sign-in: one button per workspace role, using the same
 * credentials provider the password form uses (no auth bypass), so what you
 * test is what ships. The server refuses `devRole` unless
 * ALLOW_DEV_ROLE_LOGIN is on and NODE_ENV is not production.
 */
export function RoleSwitcher({ callbackUrl = "/dashboard" }: RoleSwitcherProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, setPending] = useState<Role | null>(null);
  const [error, setError] = useState<string | null>(null);

  const requestedRole = searchParams.get("devRole");
  const autoRole: Role | null = isRole(requestedRole) ? requestedRole : null;

  const start = useCallback(
    async (role: Role) => {
      setPending(role);
      setError(null);

      const result = await signIn("credentials", {
        devRole: role,
        redirect: false,
        callbackUrl,
      });

      if (result?.error) {
        setError(
          `Could not start a ${role} session. Is ALLOW_DEV_ROLE_LOGIN="true" in .env?`
        );
        setPending(null);
        return;
      }

      router.push(callbackUrl);
      router.refresh();
    },
    [callbackUrl, router]
  );

  // /api/dev/login-as redirects here with ?devRole=... for scripted logins.
  useEffect(() => {
    if (autoRole && !pending) {
      void start(autoRole);
    }
  }, [autoRole, pending, start]);

  return (
    <div className="space-y-3" data-testid="dev-role-switcher">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
        Dev quick sign-in
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
          {error}
        </div>
      )}

      <div className="grid gap-2">
        {devRoleOptions().map((option) => (
          <Button
            key={option.role}
            type="button"
            variant="outline"
            className="h-auto justify-start gap-3 px-3 py-2 text-left"
            disabled={pending !== null}
            onClick={() => void start(option.role)}
            data-testid={`dev-role-${option.role.toLowerCase()}`}
          >
            {pending === option.role ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
            ) : (
              <UserRound className="h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            <span className="flex flex-col items-start gap-0.5">
              <span className="text-sm font-medium">{option.label}</span>
              <span className="text-xs font-normal text-muted-foreground">
                {option.blurb}
              </span>
            </span>
          </Button>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Demo accounts (demo-admin@, demo-manager@, demo-editor@, demo-client@
        socialorc.local) are created on first use with an unusable random
        password — only this panel can reach them.
      </p>
    </div>
  );
}

export default RoleSwitcher;
