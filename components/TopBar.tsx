"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { TOP_BAR_REFRESH_EVENT } from "@/lib/top-bar-events";

type Progress = { done: number; total: number };
type Status = "idle" | "good" | "warn" | "miss";
type WeightSnap = { lbs: number; date: string; isToday: boolean } | null;

function classify(done: number, total: number): Status {
  if (total === 0) return "idle";
  if (done >= total) return "good";
  // Past 6pm and still under half of the daily target — flag it.
  if (new Date().getHours() >= 18 && done < total * 0.5) return "miss";
  return "warn";
}

const DOT_COLOR: Record<Status, string> = {
  idle: "rgba(255,255,255,0.25)",
  good: "var(--color-recovery)",
  warn: "var(--color-activity)",
  miss: "var(--color-stress)",
};

function ProgressPill({
  href,
  label,
  progress,
  accent,
}: {
  href: string;
  label: string;
  progress: Progress;
  accent?: string;
}) {
  const status = classify(progress.done, progress.total);
  return (
    <Link href={href} className="topbar-pill">
      <span
        className={status === "miss" ? "topbar-dot topbar-dot-miss" : "topbar-dot"}
        style={{ background: accent ?? DOT_COLOR[status] }}
      />
      <span className="topbar-pill-label">{label}</span>
      <span className="topbar-pill-count">
        {progress.done}/{progress.total}
      </span>
    </Link>
  );
}

function WeightPill({ weight }: { weight: WeightSnap }) {
  const status: Status = weight == null ? "idle" : weight.isToday ? "good" : "warn";
  const value =
    weight == null
      ? "—"
      : Number.isInteger(weight.lbs)
        ? `${weight.lbs}`
        : weight.lbs.toFixed(1);

  return (
    <Link href="/weight" className="topbar-pill" aria-label="Weight">
      <span className="topbar-dot" style={{ background: DOT_COLOR[status] }} />
      <span className="topbar-pill-label">Weight</span>
      <span className="topbar-pill-count">
        {value}
        {weight ? <span className="topbar-pill-unit"> lb</span> : null}
      </span>
    </Link>
  );
}

type Summary = { calories: Progress; supplements: Progress; weight: WeightSnap };

const EMPTY: Progress = { done: 0, total: 0 };

function toProgress(raw: unknown): Progress {
  const r = raw as { done?: unknown; total?: unknown } | null | undefined;
  return { done: Number(r?.done) || 0, total: Number(r?.total) || 0 };
}

/** Fetch the quick-stats snapshot; null when offline / failed. */
async function loadSummary(): Promise<Summary | null> {
  try {
    const res = await fetch("/api/today/summary", { cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json();
    return {
      calories: toProgress(json?.calories),
      supplements: toProgress(json?.supplements),
      weight: json?.weight ?? null,
    };
  } catch {
    return null;
  }
}

export function TopBar() {
  const pathname = usePathname();
  const [summary, setSummary] = useState<Summary>({
    calories: EMPTY,
    supplements: EMPTY,
    weight: null,
  });
  const [refreshKey, setRefreshKey] = useState(0);

  // Refetch when the app regains focus or a page signals a change.
  useEffect(() => {
    const bump = () => setRefreshKey((k) => k + 1);
    const onVisible = () => {
      if (!document.hidden) bump();
    };
    window.addEventListener(TOP_BAR_REFRESH_EVENT, bump);
    window.addEventListener("focus", bump);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener(TOP_BAR_REFRESH_EVENT, bump);
      window.removeEventListener("focus", bump);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // Also refetch on navigation so logging elsewhere (meals, weight) shows here.
  // Offline / failed fetches keep the last known counts.
  useEffect(() => {
    let cancelled = false;
    void loadSummary().then((next) => {
      if (!cancelled && next) setSummary(next);
    });
    return () => {
      cancelled = true;
    };
  }, [pathname, refreshKey]);

  return (
    <header className="topbar" aria-label="Quick stats">
      <ProgressPill
        href="/nutrition"
        label="Cals"
        progress={summary.calories}
        accent="var(--color-nutrition)"
      />
      <WeightPill weight={summary.weight} />
      <ProgressPill
        href="/supplements"
        label="Supps"
        progress={summary.supplements}
      />
    </header>
  );
}
