"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Minus, Plus, Settings } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/PageHeader";
import { WaterSettings } from "./WaterSettings";
import {
  computeTargetMl,
  fmtMl,
  loadWater,
  subDoseLabel,
  subExtraMl,
  targetUnits,
  unitLabel,
  unitVolMl,
  waterDateKey,
  normalizeWater,
  WATER_CHANGED_EVENT,
  type WaterState,
} from "@/lib/water";
import {
  commitWaterState,
  hydrateWaterState,
  refreshWaterFromServer,
} from "@/lib/water-sync";

const SLEEP = "var(--color-sleep)";
const GOOD = "var(--color-recovery)";

export function WaterApp() {
  const [mounted, setMounted] = useState(false);
  const [state, setState] = useState<WaterState>(() => normalizeWater(null));
  const [showWhy, setShowWhy] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    hydrateWaterState().then((s) => {
      setState(s);
      setMounted(true);
    });
    const onLocal = () => setState(loadWater());
    const onRemote = () => {
      void refreshWaterFromServer().then((s) => {
        if (s) setState(s);
      });
    };
    window.addEventListener(WATER_CHANGED_EVENT, onLocal);
    window.addEventListener("storage", onLocal);
    window.addEventListener("focus", onRemote);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) onRemote();
    });
    return () => {
      window.removeEventListener(WATER_CHANGED_EVENT, onLocal);
      window.removeEventListener("storage", onLocal);
      window.removeEventListener("focus", onRemote);
    };
  }, []);

  useEffect(() => {
    if (!showSettings) return;
    void refreshWaterFromServer().then((s) => {
      if (s) setState(s);
    });
  }, [showSettings]);

  function commit(next: WaterState) {
    setState(next);
    commitWaterState(next);
  }

  function setToday(n: number) {
    const k = waterDateKey(new Date());
    const logs = { ...state.logs };
    if (n <= 0) delete logs[k];
    else logs[k] = n;
    commit({ ...state, logs });
  }

  const target = useMemo(() => targetUnits(state), [state]);
  const breakdown = useMemo(() => computeTargetMl(state), [state]);
  const todayKey = waterDateKey(new Date());
  const count = mounted ? state.logs[todayKey] ?? 0 : 0;

  const pctRaw = (count / target) * 100;
  const fillPct = Math.min(150, pctRaw) / 1.5;
  const over = pctRaw > 100;

  let helper = "Start the day — first one in.";
  let helperGood = false;
  if (count === 0) helper = "Start the day — first one in.";
  else if (pctRaw < 50) helper = "Behind pace — drink one in the next hour.";
  else if (pctRaw < 100) {
    helper = `${target - count} to go. Pacing well.`;
  } else if (pctRaw < 130) {
    helper = "✓ Target hit — top up if you train this evening.";
    helperGood = true;
  } else {
    helper = "Strong — way past target.";
    helperGood = true;
  }

  // Last 7 days (oldest → newest), excluding today for the list.
  const history = useMemo(() => {
    const days: { label: string; count: number }[] = [];
    const dows = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    for (let i = 6; i >= 1; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const k = waterDateKey(d);
      days.push({
        label: `${dows[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`,
        count: state.logs[k] ?? 0,
      });
    }
    return days;
  }, [state.logs]);

  // 14-day sparkline data including today.
  const spark = useMemo(() => {
    const data: number[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      data.push(state.logs[waterDateKey(d)] ?? 0);
    }
    return data;
  }, [state.logs]);

  const unitName = unitLabel(state, true);
  const unitSingular = unitLabel(state, false);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <PageHeader title="Water" subtitle="Hydration target tuned to your body and stack." />
        <button
          type="button"
          onClick={() => setShowSettings((s) => !s)}
          aria-label="Water settings"
          className="border-border-strong text-text-secondary hover:text-text-primary hover:bg-[rgba(255,255,255,0.04)] flex size-9 items-center justify-center rounded-lg border transition-colors"
        >
          <Settings className="size-[18px]" strokeWidth={1.5} />
        </button>
      </div>

      {showSettings ? (
        <WaterSettings state={state} onChange={commit} />
      ) : null}

      {/* Hero */}
      <Card className="space-y-1">
        <span className="metric-label">{unitName.toUpperCase()} DRANK TODAY</span>
        <div className="flex items-baseline gap-2">
          <span
            className="metric-value"
            style={{ color: SLEEP, fontSize: "clamp(40px,11vw,56px)" }}
          >
            {mounted ? count : "—"}
          </span>
          <span className="text-text-muted text-lg">/ {mounted ? target : "—"}</span>
        </div>

        {/* Progress bar with healthy-zone markers (0–150% of target) */}
        <div className="pt-3">
          <div className="relative h-7 overflow-hidden rounded-full bg-[rgba(255,255,255,0.05)]">
            <div
              className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500"
              style={{
                width: `${fillPct}%`,
                background: over
                  ? `linear-gradient(90deg, ${GOOD}, var(--color-activity))`
                  : `linear-gradient(90deg, ${SLEEP}, ${GOOD})`,
                boxShadow: "0 0 18px rgba(46,230,166,0.18)",
              }}
            />
            <span className="absolute inset-y-0 w-px bg-[rgba(255,255,255,0.18)]" style={{ left: `${65 / 1.5}%` }} />
            <span className="absolute inset-y-0 w-px bg-[rgba(255,255,255,0.18)]" style={{ left: `${100 / 1.5}%` }} />
          </div>
          <div className="mt-1.5 flex justify-between text-[10px] text-text-muted tabular-nums">
            <span>0</span>
            <span className="font-bold uppercase tracking-wider" style={{ color: GOOD }}>
              healthy zone
            </span>
            <span>{Math.ceil(target * 1.5)}+</span>
          </div>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-[56px_1fr] gap-2.5 pt-2">
          <button
            type="button"
            onClick={() => setToday(Math.max(0, count - 1))}
            disabled={count <= 0}
            aria-label="Undo last"
            className="flex items-center justify-center rounded-2xl bg-[rgba(255,255,255,0.06)] text-text-primary transition-colors hover:bg-[rgba(255,255,255,0.1)] disabled:opacity-30"
          >
            <Minus className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => setToday(count + 1)}
            className="flex items-center justify-center gap-2 rounded-2xl py-4 text-base font-bold text-[#06080b] transition-transform active:scale-[0.98]"
            style={{
              background: "linear-gradient(180deg,#ffffff 0%,#e8e5dd 100%)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.55), 0 4px 14px rgba(0,0,0,0.4)",
            }}
          >
            <Plus className="size-5" /> Drank a {unitSingular}
          </button>
        </div>

        <p
          className={`pt-3 text-center text-xs ${helperGood ? "" : "italic"}`}
          style={{ color: helperGood ? GOOD : "var(--color-text-muted)" }}
        >
          {mounted ? helper : ""}
        </p>

        {/* Why this target? */}
        <button
          type="button"
          onClick={() => setShowWhy((w) => !w)}
          className="border-border text-text-secondary hover:text-text-primary mt-2 flex w-full items-center justify-between rounded-lg border px-3.5 py-2.5 text-xs font-semibold transition-colors hover:bg-[rgba(255,255,255,0.04)]"
        >
          <span>Why this target?</span>
          <ChevronDown
            className={`size-4 transition-transform ${showWhy ? "rotate-180" : ""}`}
          />
        </button>
        {showWhy ? (
          <div className="border-border mt-2 space-y-1 rounded-lg border bg-[rgba(255,255,255,0.02)] p-4 text-[13px]">
            <WhyRow
              label={`Base (${state.profile.weightKg} ${state.weightUnit} × 35 ml)`}
              value={fmtMl(breakdown.base)}
            />
            {breakdown.exercise > 0 ? (
              <WhyRow
                label={`+ Exercise (${state.profile.activityHrsPerWeek} h/wk)`}
                value={`+ ${fmtMl(breakdown.exercise)}`}
              />
            ) : null}
            {breakdown.caffeine > 0 ? (
              <WhyRow
                label={`+ Caffeine (${state.caffeineMgPerDay} mg/day)`}
                value={`+ ${fmtMl(breakdown.caffeine)}`}
              />
            ) : null}
            {state.substances.map((s) => (
              <WhyRow
                key={s.id}
                label={`+ ${s.name} (${subDoseLabel(s)})`}
                value={`+ ${fmtMl(subExtraMl(s))}`}
              />
            ))}
            {breakdown.adjust > 0 ? (
              <WhyRow label="+ Sex / age adjustment" value={`+ ${fmtMl(breakdown.adjust)}`} />
            ) : null}
            <div className="border-border mt-2 flex justify-between border-t pt-2.5">
              <span className="font-bold" style={{ color: GOOD }}>
                Daily target
              </span>
              <span className="font-bold tabular-nums" style={{ color: GOOD }}>
                {fmtMl(breakdown.total)} ≈ {target} {unitName}
              </span>
            </div>
          </div>
        ) : null}
      </Card>

      {/* History */}
      <Card className="space-y-4">
        <span className="metric-label">Last 14 Days</span>
        <Sparkline data={spark} target={target} />
        <div className="divide-border divide-y">
          {history.map((h) => {
            const pct = Math.min(100, (h.count / target) * 100);
            const miss = h.count < target;
            return (
              <div
                key={h.label}
                className="grid grid-cols-[70px_1fr_auto] items-center gap-3 py-2.5 text-[13px]"
              >
                <span className="timestamp">{h.label}</span>
                <span className="h-2 overflow-hidden rounded-full bg-[rgba(255,255,255,0.05)]">
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${pct}%`,
                      background: miss
                        ? "rgba(255,107,107,0.4)"
                        : `linear-gradient(90deg, ${SLEEP}, ${GOOD})`,
                    }}
                  />
                </span>
                <span className="font-mono text-xs tabular-nums text-text-secondary">
                  {h.count}/{target}
                </span>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function WhyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between py-0.5">
      <span className="text-text-secondary">{label}</span>
      <span className="text-text-primary font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function Sparkline({ data, target }: { data: number[]; target: number }) {
  const W = 280;
  const H = 70;
  const pad = 4;
  const maxVal = Math.max(target, ...data) || 1;
  const colW = (W - pad * 2) / data.length;
  const barW = colW * 0.7;
  const targetY = H - pad - (target / maxVal) * (H - pad * 2);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-[70px] w-full">
      <line
        x1="0"
        x2={W}
        y1={targetY}
        y2={targetY}
        stroke="rgba(255,255,255,0.2)"
        strokeWidth="1"
        strokeDasharray="3 3"
        vectorEffect="non-scaling-stroke"
      />
      {data.map((v, i) => {
        const h = (v / maxVal) * (H - pad * 2);
        const x = pad + i * colW + (colW - barW) / 2;
        const y = H - pad - h;
        const miss = v < target;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={barW}
            height={Math.max(0, h)}
            rx="2"
            fill={miss ? "rgba(255,107,107,0.5)" : "var(--color-recovery)"}
          />
        );
      })}
    </svg>
  );
}
