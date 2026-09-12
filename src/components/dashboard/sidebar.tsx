"use client";

import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Newspaper,
  FileEdit,
  Clock,
  CheckSquare,
  MessageSquare,
  CalendarDays,
  ListOrdered,
  Globe2,
  Sparkles,
  Settings,
  LogOut,
  Inbox,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { platformIcons } from "@/components/icons/platform-icons";

const mainNav = [
  { name: "Command Center", href: "/dashboard", icon: LayoutDashboard },
  { name: "Social Timeline", href: "/dashboard/feed", icon: Newspaper },
  { name: "Inbox", href: "/dashboard/inbox", icon: Inbox },
  { name: "Create", href: "/dashboard/create", icon: FileEdit },
  { name: "Drafts", href: "/dashboard/drafts", icon: FileEdit },
  { name: "Approvals", href: "/dashboard/approvals", icon: CheckSquare },
  { name: "Scheduled", href: "/dashboard/scheduled", icon: Clock },
  { name: "Calendar", href: "/dashboard/calendar", icon: CalendarDays },
  { name: "Queue", href: "/dashboard/queue", icon: ListOrdered },
  { name: "Engagement", href: "/dashboard/engagement", icon: MessageSquare },
  { name: "Global Map", href: "/dashboard/global-map", icon: Globe2 },
  { name: "AI Studio", href: "/dashboard/ai-studio", icon: Sparkles },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="app-sidebar flex h-full w-64 flex-col border-r bg-card">
      <div className="flex h-[88px] shrink-0 items-center border-b px-6">
        <BrandLogo href="/dashboard" compact className="sidebar-brand" />
      </div>

      <nav aria-label="Workspace navigation" className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-5">
        {mainNav.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));
          return (
            <Link
              key={item.name}
              href={item.href}
              aria-label={item.name}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              <span className="nav-label">{item.name}</span>
            </Link>
          );
        })}

        <Separator className="my-4" />

        <div className="sidebar-label px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Platforms
          </p>
        </div>

        {Object.entries(platformIcons).map(([platform, Icon]) => (
          <Link
            key={platform}
            href="/settings/accounts?tab=integrations"
            aria-label={`Connect ${platform}`}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              pathname === "/settings/accounts"
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
            <span className="nav-label">{platform === "TWITTER" ? "X (Twitter)" : platform.charAt(0) + platform.slice(1).toLowerCase()}</span>
          </Link>
        ))}
      </nav>

      <div className="sidebar-motto">Good content conquers.<small>Let AI do the heavy lifting.</small></div>
      <div className="border-t p-3">
        <Link
          href="/settings/accounts"
          aria-label="Settings"
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            pathname.startsWith("/settings")
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          )}
        >
          <Settings className="h-4 w-4" />
          <span className="nav-label">Settings</span>
        </Link>
        <Button
          aria-label="Sign out"
          variant="ghost"
          className="w-full justify-start gap-3 px-3 text-muted-foreground hover:text-destructive"
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          <LogOut className="h-4 w-4" />
          <span className="nav-label">Sign out</span>
        </Button>
      </div>
    </div>
  );
}
