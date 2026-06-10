"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Apple,
  CalendarCheck,
  Droplet,
  Dumbbell,
  Flame,
  HeartPulse,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Pill,
  Shield,
  Sun,
  TrendingUp,
  User,
  Wallet,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

/** Finances code stays at /finances — flip to true to show in nav again. */
const FINANCES_NAV_ENABLED = false;

const NAV_ALL = [
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

const NAV = FINANCES_NAV_ENABLED
  ? NAV_ALL
  : NAV_ALL.filter((item) => item.href !== "/finances");

const MOBILE_PRIMARY = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/today", label: "Today", icon: Sun },
  { href: "/workouts", label: "Workouts", icon: Dumbbell },
  { href: "/nutrition", label: "Nutrition", icon: Apple },
] as const;

const MOBILE_MORE = NAV.filter(
  (item) => !MOBILE_PRIMARY.some((p) => p.href === item.href),
);

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function NavLink({
  href,
  label,
  icon: Icon,
  active,
  compact,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  active: boolean;
  compact?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-label={compact ? label : undefined}
      className={cn(
        "nav-tap flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        compact
          ? "min-w-[4.5rem] flex-col gap-1 px-2 py-2 text-[10px]"
          : "w-full",
        active
          ? compact
            ? "text-text-primary"
            : "bg-[rgba(255,255,255,0.07)] text-text-primary"
          : compact
            ? "text-text-muted hover:text-text-secondary"
            : "text-text-secondary hover:bg-[rgba(255,255,255,0.04)] hover:text-text-primary",
      )}
    >
      <Icon className="size-[18px] shrink-0" strokeWidth={1.5} />
      <span className={compact ? "leading-none" : undefined}>{label}</span>
    </Link>
  );
}

/**
 * NavBar — Coach-style side rail + native-style mobile tab bar (4 tabs + More).
 * Active state: white text + subtle fill; no colored chrome.
 */
export function NavBar() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = MOBILE_MORE.some((item) => isActive(pathname, item.href));

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!moreOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [moreOpen]);

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
          {NAV.map(({ href, label, icon }) => (
            <NavLink
              key={href}
              href={href}
              label={label}
              icon={icon}
              active={isActive(pathname, href)}
            />
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-1 pt-4">
          <NavLink
            href="/settings/profile"
            label="Profile"
            icon={User}
            active={pathname.startsWith("/settings/profile")}
          />
          <NavLink
            href="/settings/security"
            label="Security"
            icon={Shield}
            active={pathname.startsWith("/settings/security")}
          />
          <form action="/api/logout" method="post">
            <button
              type="submit"
              className="nav-tap flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-[rgba(255,255,255,0.04)] hover:text-text-primary"
            >
              <LogOut className="size-[18px]" strokeWidth={1.5} />
              Lock
            </button>
          </form>
        </div>
      </aside>

      {/* Mobile bottom tab bar */}
      <nav className="border-border bg-background fixed inset-x-0 bottom-0 z-20 flex justify-around gap-1 border-t px-2 pb-[env(safe-area-inset-bottom)] md:hidden">
        {MOBILE_PRIMARY.map(({ href, label, icon }) => (
          <NavLink
            key={href}
            href={href}
            label={label}
            icon={icon}
            active={isActive(pathname, href)}
            compact
          />
        ))}
        <button
          type="button"
          aria-label="More"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((open) => !open)}
          className={cn(
            "nav-tap flex min-w-[4.5rem] flex-col items-center gap-1 px-2 py-2 text-[10px] font-medium transition-colors",
            moreOpen || moreActive
              ? "text-text-primary"
              : "text-text-muted hover:text-text-secondary",
          )}
        >
          {moreOpen ? (
            <X className="size-[18px]" strokeWidth={1.5} />
          ) : (
            <Menu className="size-[18px]" strokeWidth={1.5} />
          )}
          <span className="leading-none">More</span>
        </button>
      </nav>

      {moreOpen ? (
        <div className="fixed inset-0 z-30 md:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/60"
            onClick={() => setMoreOpen(false)}
          />
          <div className="border-border bg-background absolute inset-x-0 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] max-h-[min(70dvh,520px)] overflow-y-auto rounded-t-2xl border-t px-4 pb-4 pt-3">
            <div className="mb-3 flex items-center justify-between">
              <span className="metric-label">More</span>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setMoreOpen(false)}
                className="nav-tap text-text-muted hover:text-text-primary rounded-lg p-2"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1">
              {MOBILE_MORE.map(({ href, label, icon }) => (
                <NavLink
                  key={href}
                  href={href}
                  label={label}
                  icon={icon}
                  active={isActive(pathname, href)}
                  onNavigate={() => setMoreOpen(false)}
                />
              ))}
              <NavLink
                href="/settings/profile"
                label="Profile"
                icon={User}
                active={pathname.startsWith("/settings/profile")}
                onNavigate={() => setMoreOpen(false)}
              />
              <NavLink
                href="/settings/security"
                label="Security"
                icon={Shield}
                active={pathname.startsWith("/settings/security")}
                onNavigate={() => setMoreOpen(false)}
              />
            </div>
            <form action="/api/logout" method="post" className="mt-2">
              <button
                type="submit"
                className="nav-tap flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-[rgba(255,255,255,0.04)] hover:text-text-primary"
              >
                <LogOut className="size-[18px]" strokeWidth={1.5} />
                Lock
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
