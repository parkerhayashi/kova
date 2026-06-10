"use client";

import { useEffect, type ReactNode } from "react";
import { hydrateClientSync } from "@/lib/client-sync";
import { GOALS_CHANGED_EVENT, runRollover, runStreakCheck } from "@/lib/goals";
import { GoalTicker } from "./GoalTicker";
import { TodoList } from "./TodoList";

/**
 * Home dashboard — title, goal ticker, health snapshot slot, and to-do list.
 * Goal state syncs via Supabase (localStorage cache).
 */
export function DashboardHome({ snapshot }: { snapshot: ReactNode }) {
  useEffect(() => {
    function settle() {
      // Streak must be tallied before rollover deletes the historical day records.
      runStreakCheck();
      runRollover();
      window.dispatchEvent(new CustomEvent(GOALS_CHANGED_EVENT));
    }

    settle();
    void hydrateClientSync(["goals"]).then((result) => {
      if (result.goals) settle();
    });
  }, []);

  return (
    <div className="home-dash">
      <h1 className="dash-title">My Dashboard</h1>
      <GoalTicker />
      {snapshot}
      <TodoList />
    </div>
  );
}
