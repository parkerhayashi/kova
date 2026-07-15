"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import {
  dayHydrationUnits,
  getDayLog,
  loadWater,
  setDayLog,
  targetUnits,
  waterDateKey,
  WATER_CHANGED_EVENT,
} from "@/lib/water";
import { commitWaterState, refreshWaterFromServer } from "@/lib/water-sync";

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

export function TopBar() {
  const [mounted, setMounted] = useState(false);
  const [water, setWater] = useState<Progress>({ done: 0, total: 0 });
  const [calories, setCalories] = useState<Progress>({ done: 0, total: 0 });
  const [weight, setWeight] = useState<WeightSnap>(null);
  const [flash, setFlash] = useState(false);

  function readLocal() {
    const w = loadWater();
    const key = waterDateKey(new Date());
    setWater({
      done: Math.round(dayHydrationUnits(w, key) * 10) / 10,
      total: targetUnits(w, key),
    });
  }

  async function pullRemote() {
    await refreshWaterFromServer();
    readLocal();
  }

  async function fetchSummary() {
    try {
      const res = await fetch("/api/today/summary", { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      if (json?.calories) {
        setCalories({
          done: Number(json.calories.done) || 0,
          total: Number(json.calories.total) || 0,
        });
      }
      setWeight(json?.weight ?? null);
    } catch {
      /* offline — keep the last known counts */
    }
  }

  useEffect(() => {
    setMounted(true);
    readLocal();
    void pullRemote();
    void fetchSummary();

    const onLocal = () => readLocal();
    const onFocus = () => {
      readLocal();
      void pullRemote();
      void fetchSummary();
    };
    const onVisible = () => {
      if (!document.hidden) onFocus();
    };
    window.addEventListener(WATER_CHANGED_EVENT, onLocal);
    window.addEventListener("storage", onLocal);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener(WATER_CHANGED_EVENT, onLocal);
      window.removeEventListener("storage", onLocal);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  function addWater() {
    const w = loadWater();
    const key = waterDateKey(new Date());
    const day = getDayLog(w, key);
    const next = setDayLog(w, key, { ...day, servings: day.servings + 1 });
    commitWaterState(next);
    const done = Math.round(dayHydrationUnits(next, key) * 10) / 10;
    setWater({ done, total: targetUnits(next, key) });
    setFlash(true);
    window.setTimeout(() => setFlash(false), 220);
  }

  const display = mounted ? { calories, weight, water } : null;

  return (
    <header className="topbar" aria-label="Quick stats">
      <ProgressPill
        href="/nutrition"
        label="Cals"
        progress={display ? calories : { done: 0, total: 0 }}
        accent="var(--color-nutrition)"
      />
      <WeightPill weight={display ? weight : null} />
      <div className="topbar-water-wrap">
        <Link
          href="/water"
          className="topbar-pill topbar-water-pill"
          aria-label="Water"
        >
          <span className="topbar-dot" style={{ background: "var(--color-sleep)" }} />
          <span className="topbar-pill-label">Water</span>
          <span className="topbar-pill-count">
            {display ? water.done : 0}/{display ? water.total : 0}
          </span>
        </Link>
        <button
          type="button"
          className={flash ? "topbar-water-add flash" : "topbar-water-add"}
          aria-label="Log one drink"
          onClick={addWater}
        >
          <Plus size={16} strokeWidth={2.5} />
        </button>
      </div>
    </header>
  );
}
