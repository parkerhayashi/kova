"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
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
  Sun,
  TrendingUp,
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
 * NavBar — desktop side rail + mobile bottom tab bar.
 * Chrome only: active state is white text + rgba(255,255,255,0.08) bg,
 * never a colored accent (blueprint §4 design rules).
 */
export function NavBar() {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop side rail */}
      <aside className="border-border bg-background fixed inset-y-0 left-0 z-20 hidden w-56 flex-col border-r px-3 py-6 md:flex">
        <div className="flex items-center gap-2.5 px-3 pb-8">
          <Activity
            className="size-5 text-[color:var(--color-hud)]"
            strokeWidth={1.5}
            style={{ filter: "drop-shadow(0 0 6px var(--color-hud))" }}
          />
          <span
            className="text-text-primary text-lg font-medium tracking-[0.18em] uppercase"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Kova
          </span>
          <span className="hud-pulse ml-auto size-1.5 rounded-full bg-[color:var(--color-hud)]" />
        </div>
        <nav className="flex flex-col gap-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-[rgba(255,255,255,0.07)] text-text-primary"
                    : "text-text-secondary hover:text-text-primary hover:bg-[rgba(255,255,255,0.04)]",
                )}
              >
                {active ? (
                  <span
                    className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-[color:var(--color-hud)]"
                    style={{ boxShadow: "0 0 8px var(--color-hud)" }}
                  />
                ) : null}
                <Icon className="size-[18px]" strokeWidth={1.5} />
                {label}
              </Link>
            );
          })}
        </nav>
        <form action="/api/logout" method="post" className="mt-auto pt-4">
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-[rgba(255,255,255,0.04)] hover:text-text-primary"
          >
            <LogOut className="size-[18px]" strokeWidth={1.5} />
            Lock
          </button>
        </form>
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
                "flex min-w-[3.25rem] flex-col items-center gap-1 px-1 py-2 text-[10px] transition-colors",
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
