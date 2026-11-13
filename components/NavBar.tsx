"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Apple,
  Bike,
  CalendarDays,
  ChevronDown,
  Dumbbell,
  Flame,
  Footprints,
  HeartPulse,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Pill,
  Plug,
  Scale,
  Shield,
  TrendingUp,
  User,
  Wallet,
  Watch,
  X,
} from "lucide-react";
import { KovaWordmark } from "@/components/brand/KovaWordmark";
import { cn } from "@/lib/utils";

/** Finances code stays at /finances — flip to true to show in nav again. */
const FINANCES_NAV_ENABLED = false;

type NavIcon = typeof LayoutDashboard;

type NavLeaf = {
  type: "link";
  href: string;
  label: string;
  icon: NavIcon;
};

type NavGroup = {
  type: "group";
  id: string;
  label: string;
  icon: NavIcon;
  children: NavLeaf[];
};

type NavItem = NavLeaf | NavGroup;

const OURA_CHILDREN: NavLeaf[] = [
  { type: "link", href: "/sleep", label: "Sleep", icon: Moon },
  { type: "link", href: "/recovery", label: "Readiness", icon: HeartPulse },
  { type: "link", href: "/activity", label: "Activity", icon: Flame },
];

const TRAINING_CHILDREN: NavLeaf[] = [
  { type: "link", href: "/training", label: "Calendar", icon: CalendarDays },
  { type: "link", href: "/workouts", label: "Workouts", icon: Dumbbell },
  { type: "link", href: "/running", label: "Running", icon: Footprints },
  { type: "link", href: "/cycling", label: "Cycling", icon: Bike },
  { type: "link", href: "/weight", label: "Weight", icon: Scale },
];

const NUTRITION_CHILDREN: NavLeaf[] = [
  { type: "link", href: "/nutrition", label: "Nutrition", icon: Apple },
  { type: "link", href: "/supplements", label: "Supplements", icon: Pill },
];

const NAV_ALL: NavItem[] = [
  { type: "link", href: "/", label: "Home", icon: LayoutDashboard },
  {
    type: "group",
    id: "oura",
    label: "Oura",
    icon: Watch,
    children: OURA_CHILDREN,
  },
  {
    type: "group",
    id: "training",
    label: "Training",
    icon: Dumbbell,
    children: TRAINING_CHILDREN,
  },
  {
    type: "group",
    id: "nutrition",
    label: "Nutrition",
    icon: Apple,
    children: NUTRITION_CHILDREN,
  },
  { type: "link", href: "/trends", label: "Trends", icon: TrendingUp },
  { type: "link", href: "/finances", label: "Finances", icon: Wallet },
];

const NAV = FINANCES_NAV_ENABLED
  ? NAV_ALL
  : NAV_ALL.filter(
      (item) => item.type === "group" || item.href !== "/finances",
    );

const MOBILE_PRIMARY: NavLeaf[] = [
  { type: "link", href: "/", label: "Home", icon: LayoutDashboard },
  { type: "link", href: "/nutrition", label: "Nutrition", icon: Apple },
  { type: "link", href: "/supplements", label: "Supplements", icon: Pill },
  { type: "link", href: "/training", label: "Training", icon: CalendarDays },
];

/** More sheet: groups plus any leftover top-level links (e.g. Finances). */
const MOBILE_MORE = NAV.filter((item) => {
  if (item.type === "group") return true;
  return !MOBILE_PRIMARY.some((p) => p.href === item.href);
});

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function groupIsActive(pathname: string, group: NavGroup) {
  return group.children.some((child) => isActive(pathname, child.href));
}

function NavLink({
  href,
  label,
  icon: Icon,
  active,
  compact,
  nested,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: NavIcon;
  active: boolean;
  compact?: boolean;
  nested?: boolean;
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
        nested && !compact ? "pl-10" : null,
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

function NavGroupItem({
  group,
  pathname,
  onNavigate,
}: {
  group: NavGroup;
  pathname: string;
  onNavigate?: () => void;
}) {
  const childActive = groupIsActive(pathname, group);
  const [open, setOpen] = useState(childActive);

  useEffect(() => {
    if (childActive) setOpen(true);
  }, [childActive, pathname]);

  return (
    <div className="flex flex-col gap-0.5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "nav-tap flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
          childActive
            ? "text-text-primary"
            : "text-text-secondary hover:bg-[rgba(255,255,255,0.04)] hover:text-text-primary",
        )}
      >
        <group.icon className="size-[18px] shrink-0" strokeWidth={1.5} />
        <span className="flex-1 text-left">{group.label}</span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-text-muted transition-transform",
            open ? "rotate-180" : "",
          )}
          strokeWidth={1.5}
        />
      </button>
      {open ? (
        <div className="flex flex-col gap-0.5">
          {group.children.map((child) => (
            <NavLink
              key={child.href}
              href={child.href}
              label={child.label}
              icon={child.icon}
              active={isActive(pathname, child.href)}
              nested
              onNavigate={onNavigate}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * NavBar — Coach-style side rail + native-style mobile tab bar (4 tabs + More).
 * Active state: white text + subtle fill; no colored chrome.
 * Oura pages (Sleep / Readiness / Activity) nest under one expandable group.
 */
export function NavBar() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = MOBILE_MORE.some((item) =>
    item.type === "group"
      ? groupIsActive(pathname, item)
      : isActive(pathname, item.href),
  );

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
          <Link href="/" aria-label="Kova home">
            <KovaWordmark height={26} />
          </Link>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV.map((item) =>
            item.type === "group" ? (
              <NavGroupItem key={item.id} group={item} pathname={pathname} />
            ) : (
              <NavLink
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={isActive(pathname, item.href)}
              />
            ),
          )}
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
          <NavLink
            href="/settings/connections"
            label="Connections"
            icon={Plug}
            active={pathname.startsWith("/settings/connections")}
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
            <div className="flex flex-col gap-3">
              {(() => {
                const groups = MOBILE_MORE.filter(
                  (item): item is NavGroup => item.type === "group",
                );
                const links = MOBILE_MORE.filter(
                  (item): item is NavLeaf => item.type === "link",
                );
                return (
                  <>
                    {groups.map((group) => (
                      <div key={group.id} className="space-y-1">
                        <div className="text-text-muted flex items-center gap-2 px-1 text-[10px] font-semibold uppercase tracking-wider">
                          <group.icon className="size-3.5" strokeWidth={1.5} />
                          {group.label}
                        </div>
                        <div className="grid grid-cols-2 gap-1">
                          {group.children.map((child) => (
                            <NavLink
                              key={child.href}
                              href={child.href}
                              label={child.label}
                              icon={child.icon}
                              active={isActive(pathname, child.href)}
                              onNavigate={() => setMoreOpen(false)}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                    {links.length > 0 ? (
                      <div className="grid grid-cols-2 gap-1">
                        {links.map((item) => (
                          <NavLink
                            key={item.href}
                            href={item.href}
                            label={item.label}
                            icon={item.icon}
                            active={isActive(pathname, item.href)}
                            onNavigate={() => setMoreOpen(false)}
                          />
                        ))}
                      </div>
                    ) : null}
                  </>
                );
              })()}
              <div className="grid grid-cols-2 gap-1 border-t border-border pt-2">
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
                <NavLink
                  href="/settings/connections"
                  label="Connections"
                  icon={Plug}
                  active={pathname.startsWith("/settings/connections")}
                  onNavigate={() => setMoreOpen(false)}
                />
              </div>
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
