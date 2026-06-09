"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Apple,
  CalendarCheck,
  Droplet,
  Dumbbell,
  Flame,
  HeartPulse,
  LayoutDashboard,
  LogOut,
  Moon,
  Pill,
  Shield,
  Sun,
  TrendingUp,
  User,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/today", label: "Today", icon: Sun },
  { href: "/sleep", label: "Sleep", icon: Moon },
  { href: "/recovery", label: "Readiness", icon: HeartPulse },
  { href: "/activity", label: "Activity", icon: Flame },
  { href: "/workouts", label: "Workouts", icon: Dumbbell },
  { href: "/nutrition", label: "Nutrition", icon: Apple },
  { href: "/water", label: "Water", icon: Droplet },
  { href: "/supplements", label: "Supplements", icon: Pill },
  { href: "/habits", label: "Habits", icon: CalendarCheck },
  { href: "/finances", label: "Finances", icon: Wallet },
  { href: "/trends", label: "Trends", icon: TrendingUp },
] as const;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/**
 * NavBar — Coach-style side rail + mobile tab bar.
 * Active state: white text + subtle fill; no colored chrome.
 */
export function NavBar() {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop side rail */}
      <aside className="border-border bg-background fixed inset-y-0 left-0 z-20 hidden w-56 flex-col border-r px-3 py-6 md:flex">
        <div className="px-3 pb-8">
          <span className="text-text-primary text-lg font-bold tracking-tight">
            Kova
          </span>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-[rgba(255,255,255,0.07)] text-text-primary"
                    : "text-text-secondary hover:bg-[rgba(255,255,255,0.04)] hover:text-text-primary",
                )}
              >
                <Icon className="size-[18px]" strokeWidth={1.5} />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto flex flex-col gap-1 pt-4">
          <Link
            href="/settings/profile"
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              pathname.startsWith("/settings/profile")
                ? "bg-[rgba(255,255,255,0.07)] text-text-primary"
                : "text-text-secondary hover:bg-[rgba(255,255,255,0.04)] hover:text-text-primary",
            )}
          >
            <User className="size-[18px]" strokeWidth={1.5} />
            Profile
          </Link>
          <Link
            href="/settings/security"
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              pathname.startsWith("/settings/security")
                ? "bg-[rgba(255,255,255,0.07)] text-text-primary"
                : "text-text-secondary hover:bg-[rgba(255,255,255,0.04)] hover:text-text-primary",
            )}
          >
            <Shield className="size-[18px]" strokeWidth={1.5} />
            Security
          </Link>
          <form action="/api/logout" method="post">
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-[rgba(255,255,255,0.04)] hover:text-text-primary"
            >
              <LogOut className="size-[18px]" strokeWidth={1.5} />
              Lock
            </button>
          </form>
        </div>
      </aside>

      {/* Mobile bottom tab bar */}
      <nav className="border-border bg-background/95 fixed inset-x-0 bottom-0 z-20 flex justify-between gap-0.5 overflow-x-auto border-t px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-label={label}
              className={cn(
                "flex min-w-[3.25rem] flex-col items-center gap-1 px-1 py-2 text-[10px] font-medium transition-colors",
                active
                  ? "text-text-primary"
                  : "text-text-muted hover:text-text-secondary",
              )}
            >
              <Icon className="size-[18px]" strokeWidth={1.5} />
              <span className="leading-none">{label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
