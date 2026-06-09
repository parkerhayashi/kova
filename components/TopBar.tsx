"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { getTodayGoals, GOALS_CHANGED_EVENT } from "@/lib/goals";
import {
  loadWater,
  targetUnits,
  waterDateKey,
  WATER_CHANGED_EVENT,
} from "@/lib/water";
import { commitWaterState, refreshWaterFromServer } from "@/lib/water-sync";

type Progress = { done: number; total: number };
type Status = "idle" | "good" | "warn" | "miss";

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

function Pill({
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

export function TopBar({ initialStack }: { initialStack: Progress }) {
  const [mounted, setMounted] = useState(false);
  const [goals, setGoals] = useState<Progress>({ done: 0, total: 0 });
  const [water, setWater] = useState<Progress>({ done: 0, total: 0 });
  const [stack, setStack] = useState<Progress>(initialStack);
  const [flash, setFlash] = useState(false);

  function readLocal() {
    const g = getTodayGoals();
    setGoals({ done: g.filter((x) => x.done).length, total: g.length });
    const w = loadWater();
    const key = waterDateKey(new Date());
    setWater({ done: w.logs[key] ?? 0, total: targetUnits(w) });
  }

  async function pullRemote() {
    await refreshWaterFromServer();
    readLocal();
  }

  async function fetchStack() {
    try {
      const res = await fetch("/api/today/summary", { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      if (json?.supplements) setStack(json.supplements);
    } catch {
      /* offline — keep the last known count */
    }
  }

  useEffect(() => {
    setMounted(true);
    readLocal();
    void pullRemote();
    fetchStack();

    const onLocal = () => readLocal();
    const onFocus = () => {
      readLocal();
      void pullRemote();
      fetchStack();
    };
    const onVisible = () => {
      if (!document.hidden) onFocus();
    };
    window.addEventListener(GOALS_CHANGED_EVENT, onLocal);
    window.addEventListener(WATER_CHANGED_EVENT, onLocal);
    window.addEventListener("storage", onLocal);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    const iv = window.setInterval(onFocus, 60 * 1000);
    return () => {
      window.clearInterval(iv);
      window.removeEventListener(GOALS_CHANGED_EVENT, onLocal);
      window.removeEventListener(WATER_CHANGED_EVENT, onLocal);
      window.removeEventListener("storage", onLocal);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  function addWater() {
    const w = loadWater();
    const key = waterDateKey(new Date());
    const logs = { ...w.logs, [key]: (w.logs[key] ?? 0) + 1 };
    commitWaterState({ ...w, logs });
    setWater({ done: logs[key], total: targetUnits(w) });
    setFlash(true);
    window.setTimeout(() => setFlash(false), 220);
  }

  const display = mounted ? { goals, stack, water } : null;

  return (
    <header className="topbar" aria-label="Quick stats">
      <Pill
        href="/"
        label="Goals"
        progress={display ? goals : { done: 0, total: 0 }}
      />
      <Pill
        href="/supplements"
        label="Stack"
        progress={display ? stack : { done: 0, total: 0 }}
      />
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
