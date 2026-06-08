"use client";

import { useEffect, useState } from "react";

const WAKE_HOUR = 8;
const SLEEP_HOUR = 24;
const R = 52;
const C = 2 * Math.PI * R;

// Sun-cycle palette: [percent, [r,g,b]] from morning gold to deep night blue.
const STOPS: [number, [number, number, number]][] = [
  [0, [255, 216, 158]],
  [12.5, [255, 205, 121]],
  [25, [255, 227, 143]],
  [37.5, [255, 183, 106]],
  [50, [255, 149, 89]],
  [62.5, [243, 111, 79]],
  [75, [226, 93, 122]],
  [87.5, [123, 91, 176]],
  [100, [47, 58, 102]],
];

function lerpColor(percent: number): string {
  const p = Math.max(0, Math.min(100, percent));
  for (let i = 0; i < STOPS.length - 1; i++) {
    const [p0, c0] = STOPS[i];
    const [p1, c1] = STOPS[i + 1];
    if (p >= p0 && p <= p1) {
      const t = (p - p0) / (p1 - p0);
      const r = Math.round(c0[0] + (c1[0] - c0[0]) * t);
      const g = Math.round(c0[1] + (c1[1] - c0[1]) * t);
      const b = Math.round(c0[2] + (c1[2] - c0[2]) * t);
      return `rgb(${r}, ${g}, ${b})`;
    }
  }
  return `rgb(${STOPS[STOPS.length - 1][1].join(", ")})`;
}

function fmtHM(hours: number): string {
  const total = Math.max(0, hours);
  const h = Math.floor(total);
  const m = Math.round((total - h) * 60);
  if (m === 60) return `${h + 1}h 0m`;
  return `${h}h ${m}m`;
}

function clockLabel(now: Date): string {
  let h = now.getHours();
  const m = now.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${String(m).padStart(2, "0")} ${ampm}`;
}

interface RingState {
  percent: number;
  color: string;
  pct: string;
  phase: string;
  status: string;
  remaining: string;
  clock: string;
}

function compute(): RingState {
  const now = new Date();
  const hours = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
  const clock = clockLabel(now);

  if (hours < WAKE_HOUR) {
    return {
      percent: 0,
      color: "#4D4B47",
      pct: "—",
      phase: "SLEEPING",
      status: "😴 Still sleeping",
      remaining: `${fmtHM(WAKE_HOUR - hours)} until wake-up`,
      clock,
    };
  }

  if (hours >= SLEEP_HOUR) {
    return {
      percent: 100,
      color: "#E25D7A",
      pct: "100%",
      phase: "PAST BEDTIME",
      status: "⚠️ Past bedtime",
      remaining: "Sleep!",
      clock,
    };
  }

  const percent = ((hours - WAKE_HOUR) / (SLEEP_HOUR - WAKE_HOUR)) * 100;
  let phase: string;
  let status: string;
  if (percent < 25) {
    phase = "MORNING";
    status = "☀️ Morning — fresh start";
  } else if (percent < 50) {
    phase = "MIDDAY";
    status = "⚡ Midday — keep moving";
  } else if (percent < 75) {
    phase = "AFTERNOON";
    status = "🔥 Afternoon — push it";
  } else if (percent < 90) {
    phase = "EVENING";
    status = "⏳ Evening — wrap up";
  } else {
    phase = "BEDTIME";
    status = "🌙 Bedtime soon";
  }

  return {
    percent,
    color: lerpColor(percent),
    pct: `${Math.round(percent)}%`,
    phase,
    status,
    remaining: `${fmtHM(SLEEP_HOUR - hours)} awake time left`,
    clock,
  };
}

/** Day ring — fills 8 AM → midnight with a sun-cycle color and phase label. */
export function DayRing() {
  const [mounted, setMounted] = useState(false);
  const [ring, setRing] = useState<RingState>({
    percent: 0,
    color: "#4D4B47",
    pct: "—",
    phase: "—",
    status: "—",
    remaining: "",
    clock: "",
  });

  useEffect(() => {
    setMounted(true);
    setRing(compute());
    const interval = setInterval(() => setRing(compute()), 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const offset = C * (1 - ring.percent / 100);
  const stroke = mounted ? ring.color : "#4D4B47";

  return (
    <div className="day-ring-wrap dash-card">
      <div className="day-ring">
        <svg viewBox="0 0 120 120">
          <circle
            cx="60"
            cy="60"
            r={R}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="8"
          />
          <circle
            className="day-ring-fill"
            cx="60"
            cy="60"
            r={R}
            fill="none"
            stroke={stroke}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={mounted ? offset : C}
            transform="rotate(-90 60 60)"
            style={{ filter: `drop-shadow(0 0 5px ${stroke})` }}
          />
        </svg>
        <div className="day-ring-overlay">
          <span className="day-ring-pct" style={{ color: mounted ? ring.color : undefined }}>
            {mounted ? ring.pct : "—"}
          </span>
          <span className="day-ring-phase">{mounted ? ring.phase : "—"}</span>
          <span className="day-ring-clock">{ring.clock}</span>
        </div>
      </div>
      <div className="day-ring-text">
        <span className="day-ring-status">{mounted ? ring.status : "—"}</span>
        <span className="day-ring-remaining">{ring.remaining}</span>
        <span className="day-ring-hours">8:00 AM – 12:00 AM</span>
      </div>
    </div>
  );
}
