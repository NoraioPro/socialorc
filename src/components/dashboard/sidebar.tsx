"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FileEdit,
  Clock,
  CheckSquare,
  CalendarDays,
  LogOut,
  Brain,
  Link as LinkIcon,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { platformIcons } from "@/components/icons/platform-icons";

const mainNav = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Drafts", href: "/dashboard/drafts", icon: FileEdit },
  { name: "Approvals", href: "/dashboard/approvals", icon: CheckSquare },
  { name: "Scheduled", href: "/dashboard/scheduled", icon: Clock },
  { name: "Calendar", href: "/dashboard/calendar", icon: CalendarDays },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="flex h-full w-64 flex-col border-r bg-card">
      <div className="flex h-16 items-center border-b px-6">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold">
            S
          </div>
          <span className="text-xl font-bold">SocialOrc</span>
        </Link>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {mainNav.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.name}
            </Link>
          );
        })}

        <Separator className="my-4" />

        <div className="px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Platforms
          </p>
        </div>

        {Object.entries(platformIcons).map(([platform, Icon]) => (
          <Link
            key={platform}
            href={`/dashboard/platform/${platform.toLowerCase()}`}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              pathname === `/dashboard/platform/${platform.toLowerCase()}`
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
            {platform === "TWITTER" ? "X (Twitter)" : platform.charAt(0) + platform.slice(1).toLowerCase()}
          </Link>
        ))}
      </nav>

      <div className="border-t p-3 space-y-1">
        <div className="px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Settings
          </p>
        </div>
        <Link
          href="/settings/accounts"
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            pathname === "/settings/accounts"
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          )}
        >
          <LinkIcon className="h-4 w-4" />
          Accounts
        </Link>
        <Link
          href="/settings/brand-brain"
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            pathname === "/settings/brand-brain"
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          )}
        >
          <Brain className="h-4 w-4" />
          Brand Brain
        </Link>
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 px-3 text-muted-foreground hover:text-destructive"
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
      </div>
    </div>
  );
}
