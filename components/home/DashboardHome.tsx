"use client";

import { useEffect } from "react";
import { GOALS_CHANGED_EVENT, runRollover, runStreakCheck } from "@/lib/goals";
import { GoalTicker } from "./GoalTicker";
import { DayRing } from "./DayRing";
import { TodoList } from "./TodoList";

/**
 * Home dashboard — the personal command center: title, goal ticker, day ring,
 * and the To Do List. All goal state is client-side (localStorage).
 */
export function DashboardHome() {
  useEffect(() => {
    // Streak must be tallied before rollover deletes the historical day records.
    runStreakCheck();
    runRollover();
    // Nudge the ticker + lists to re-read after rollover/streak settle.
    window.dispatchEvent(new CustomEvent(GOALS_CHANGED_EVENT));
  }, []);

  return (
    <div className="home-dash">
      <h1 className="dash-title">My Dashboard</h1>
      <GoalTicker />
      <DayRing />
      <TodoList />
    </div>
  );
}
