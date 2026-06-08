"use client";

import { useEffect, useRef, useState } from "react";
import { GOALS_CHANGED_EVENT, getTodayGoals } from "@/lib/goals";

interface Item {
  status: "done" | "pending" | "empty";
  text: string;
}

function buildItems(): { items: Item[]; done: number; total: number } {
  const goals = getTodayGoals();
  const total = goals.length;
  const done = goals.filter((g) => g.done).length;
  let items: Item[];
  if (total === 0) {
    items = [{ status: "empty", text: "No goals set for today — add one to get rolling." }];
  } else if (done === total) {
    items = [{ status: "done", text: "✓ All goals done — solid day." }];
  } else {
    items = goals.filter((g) => !g.done).map((g) => ({ status: "pending", text: g.text }));
  }
  return { items, done, total };
}

function glyph(status: string): string {
  return status === "done" ? "✓" : status === "pending" ? "○" : "·";
}

/**
 * Goal ticker — a NASDAQ-style LED strip that rotates through today's pending
 * goals every 5s and updates instantly on any goals-changed event.
 */
export function GoalTicker() {
  const [mounted, setMounted] = useState(false);
  const [meta, setMeta] = useState("0/0");
  const [frame, setFrame] = useState<{ cur: Item; prev: Item | null; n: number }>({
    cur: { status: "empty", text: "Loading…" },
    prev: null,
    n: 0,
  });
  const state = useRef({ items: [] as Item[], idx: 0 });

  useEffect(() => {
    setMounted(true);

    function rebuild(reset: boolean) {
      const { items, done, total } = buildItems();
      state.current.items = items;
      if (reset) state.current.idx = 0;
      setMeta(`${done}/${total}`);
    }

    function tick() {
      if (state.current.items.length === 0) rebuild(false);
      const { items } = state.current;
      const cur = items[state.current.idx % items.length] ?? { status: "empty" as const, text: "—" };
      setFrame((f) => ({ cur, prev: f.n === 0 ? null : f.cur, n: f.n + 1 }));
      state.current.idx = (state.current.idx + 1) % items.length;
      const { done, total } = buildItems();
      setMeta(`${done}/${total}`);
    }

    rebuild(true);
    tick();
    const interval = setInterval(tick, 5000);

    function onChange() {
      rebuild(true);
      tick();
    }
    window.addEventListener(GOALS_CHANGED_EVENT, onChange);
    return () => {
      clearInterval(interval);
      window.removeEventListener(GOALS_CHANGED_EVENT, onChange);
    };
  }, []);

  const animate = mounted && frame.prev !== null;

  return (
    <div className="ticker-row">
      <div className="goal-ticker" aria-live="polite" aria-atomic="true">
        <div className="goal-ticker-led">
          <span className="goal-ticker-led-dot" />
        </div>
        <div className="goal-ticker-label">GOALS</div>
        <div className="goal-ticker-stage">
          {animate && frame.prev ? (
            <div className="goal-ticker-row is-leaving" key={`l-${frame.n}`}>
              <span className="goal-ticker-status" data-status={frame.prev.status}>
                {glyph(frame.prev.status)}
              </span>
              <span className="goal-ticker-text">{frame.prev.text}</span>
            </div>
          ) : null}
          <div
            className={`goal-ticker-row${animate ? " is-entering" : ""}`}
            key={`e-${frame.n}`}
          >
            <span
              className="goal-ticker-status"
              data-status={mounted ? frame.cur.status : ""}
            >
              {mounted ? glyph(frame.cur.status) : "—"}
            </span>
            <span className="goal-ticker-text">
              {mounted ? frame.cur.text : "Loading…"}
            </span>
          </div>
        </div>
        <div className="goal-ticker-meta">{meta}</div>
      </div>
    </div>
  );
}
