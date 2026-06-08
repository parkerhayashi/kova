"use client";

import { useEffect, useRef, useState } from "react";
import {
  GOALS_CHANGED_EVENT,
  formatDate,
  getActiveDateString,
  getStreak,
  getTomorrowDateString,
  goalsKey,
  storeGet,
  storeSet,
  type Goal,
} from "@/lib/goals";

// Inline-polish is opt-in; without a key it just adds the text as typed.
const ANTHROPIC_API_KEY = "";

function readGoals(key: string): Goal[] {
  return storeGet<Goal[]>(key) ?? [];
}

function mutate(key: string, fn: (arr: Goal[]) => Goal[]): void {
  storeSet(key, fn(readGoals(key).map((g) => ({ ...g }))));
}

// --- single goal row (keeps inline-edit state local) -----------------------
function GoalRow({
  goal,
  readOnly,
  flashing,
  onToggle,
  onCommitText,
  onQueue,
  onDelete,
  onDragStart,
  onDragOver,
  onDrop,
  isDragOver,
}: {
  goal: Goal;
  readOnly: boolean;
  flashing: boolean;
  onToggle: () => void;
  onCommitText: (text: string) => void;
  onQueue: () => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  isDragOver: boolean;
}) {
  const textRef = useRef<HTMLSpanElement>(null);
  const [editing, setEditing] = useState(false);

  function startEdit() {
    setEditing(true);
    requestAnimationFrame(() => {
      const el = textRef.current;
      if (!el) return;
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    });
  }

  function commit() {
    setEditing(false);
    const next = textRef.current?.textContent?.trim() ?? "";
    if (next && next !== goal.text) onCommitText(next);
    else if (textRef.current) textRef.current.textContent = goal.text;
  }

  return (
    <li
      className={[
        "goal-row",
        goal.done ? "is-done" : "",
        goal.queued ? "is-queued" : "",
        flashing ? "is-queue-flashing" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      draggable={!editing}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      style={isDragOver ? { borderTopColor: "rgba(255,255,255,0.4)" } : undefined}
    >
      <span className="gm-drag" title="Drag to reorder">
        ⋮⋮
      </span>
      <button
        type="button"
        className={`gm-check${goal.done ? " is-checked" : ""}`}
        onClick={onToggle}
        disabled={readOnly}
        title={readOnly ? "Activates at 6 AM tomorrow" : "Toggle complete"}
        aria-label="Toggle complete"
      />
      <span
        ref={textRef}
        className="gm-text"
        contentEditable={editing}
        suppressContentEditableWarning
        onClick={() => !editing && startEdit()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLElement).blur();
          } else if (e.key === "Escape") {
            if (textRef.current) textRef.current.textContent = goal.text;
            setEditing(false);
            (e.target as HTMLElement).blur();
          }
        }}
      >
        {goal.text}
      </span>
      <button
        type="button"
        className={`gm-queue-btn${goal.queued ? " is-active" : ""}`}
        onClick={onQueue}
        disabled={readOnly}
        title="Queue for productivity window"
        aria-label="Queue goal"
      >
        ⚡
      </button>
      <button
        type="button"
        className="goal-delete"
        onClick={onDelete}
        title="Delete"
        aria-label="Delete goal"
      >
        ×
      </button>
    </li>
  );
}

// --- quick add row ---------------------------------------------------------
function QuickAdd({
  placeholder,
  onAdd,
}: {
  placeholder: string;
  onAdd: (text: string) => void;
}) {
  const [value, setValue] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function flash(msg: string, isError = false) {
    setStatus(msg);
    setError(isError);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus(""), 3500);
  }

  function add() {
    const text = value.trim();
    if (!text) return;
    onAdd(text);
    setValue("");
  }

  async function polish() {
    const text = value.trim();
    if (!text) return;
    if (!ANTHROPIC_API_KEY) {
      onAdd(text);
      setValue("");
      flash("Polish needs an Anthropic API key — added as-typed.");
      return;
    }
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5",
          max_tokens: 1000,
          messages: [
            {
              role: "user",
              content: `Clean up exactly ONE goal and return it as a one-element JSON array of strings, no preamble, no fences: ${text}`,
            },
          ],
        }),
      });
      const data = await res.json();
      const raw = data?.content?.[0]?.text ?? "";
      const parsed = JSON.parse(raw);
      const polished = Array.isArray(parsed) && parsed[0] ? String(parsed[0]) : text;
      onAdd(polished);
      setValue("");
    } catch {
      onAdd(text);
      setValue("");
      flash("Polish failed — added as-typed.", true);
    }
  }

  return (
    <>
      <div className="gm-input-wrap">
        <input
          className="gm-input"
          value={value}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className="gm-btn-add" onClick={add}>
          + Add
        </button>
        <button type="button" className="gm-btn-polish" onClick={polish}>
          ✨ Polish
        </button>
      </div>
      <div className={`gm-status${error ? " is-error" : ""}`}>{status}</div>
    </>
  );
}

// --- one card (today or tomorrow) ------------------------------------------
function GoalCard({
  variant,
  goals,
  dateKey,
  otherKey,
  streak,
}: {
  variant: "today" | "tomorrow";
  goals: Goal[];
  dateKey: string;
  otherKey: string;
  streak: number;
}) {
  const readOnly = variant === "tomorrow";
  const [expanded, setExpanded] = useState(false);
  const [flashIdx, setFlashIdx] = useState<number | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const total = goals.length;
  const done = goals.filter((g) => g.done).length;
  const allDone = total > 0 && done === total;
  const remaining = total - done;

  const label =
    total === 0 ? "no goals yet" : allDone ? "all done — solid day" : "complete";

  function toggle(idx: number) {
    mutate(dateKey, (arr) => {
      const g = arr[idx];
      g.done = !g.done;
      if (g.done) g.doneAt = Date.now();
      else delete g.doneAt;
      return arr;
    });
  }
  function commitText(idx: number, text: string) {
    mutate(dateKey, (arr) => {
      arr[idx].text = text;
      return arr;
    });
  }
  function del(idx: number) {
    mutate(dateKey, (arr) => arr.filter((_, i) => i !== idx));
  }
  function queue(idx: number) {
    setFlashIdx(idx);
    setTimeout(() => {
      mutate(dateKey, (arr) => {
        arr[idx].queued = !arr[idx].queued;
        return arr;
      });
      setFlashIdx(null);
    }, 480);
  }
  function add(text: string) {
    mutate(dateKey, (arr) => {
      arr.push({ text, done: false });
      return arr;
    });
  }
  function reorder(from: number, to: number) {
    if (from === to) return;
    mutate(dateKey, (arr) => {
      const [moved] = arr.splice(from, 1);
      arr.splice(to, 0, moved);
      return arr;
    });
  }
  function pushRemaining() {
    const cur = readGoals(dateKey);
    const undone = cur.filter((g) => !g.done);
    if (undone.length === 0) return;
    if (!confirm(`Move ${undone.length} unchecked goal(s) to tomorrow?`)) return;
    const tmr = readGoals(otherKey);
    for (const g of undone) {
      if (!tmr.some((t) => t.text === g.text)) tmr.push({ text: g.text, done: false });
    }
    storeSet(otherKey, tmr);
    storeSet(
      dateKey,
      cur.filter((g) => g.done),
    );
  }

  const visible = expanded ? goals : goals.slice(0, 5);

  return (
    <div className={`dash-card gm-card${variant === "tomorrow" ? " gm-card-tomorrow" : ""}${allDone ? " gm-all-done" : ""}`}>
      <div className="gm-header">
        <div>
          <div className="gm-eyebrow">
            {variant === "today"
              ? `Today — ${formatDate(getActiveDateString())}`
              : `Plan tomorrow — ${formatDate(getTomorrowDateString())}`}
          </div>
          {variant === "today" ? (
            <div className="gm-progress-row">
              <span className="gm-progress-num">{done}</span>
              <span className="gm-progress-total">/ {total}</span>
              <span className="gm-progress-label">{label}</span>
            </div>
          ) : (
            <div className="gm-subtext">Write tonight, locked until 6 AM.</div>
          )}
        </div>
        {variant === "today" ? (
          <div className={`gm-streak${streak > 0 ? " gm-streak-active" : ""}`}>
            <span className="gm-streak-bolt">⚡</span>
            <span className="gm-streak-num">{streak}</span>
            <span className="gm-streak-label">day streak</span>
          </div>
        ) : (
          <div className="gm-count-badge">{total} planned</div>
        )}
      </div>

      {variant === "today" ? (
        <div className="gm-bar">
          {goals.map((g, i) => (
            <span key={i} className={`gm-bar-seg${g.done ? " gm-bar-seg-done" : ""}`} />
          ))}
        </div>
      ) : null}

      {total === 0 ? (
        <div className="empty-state">
          {variant === "today"
            ? "No goals for today yet — add one below."
            : "Nothing planned for tomorrow yet"}
        </div>
      ) : (
        <ul className="goal-list">
          {visible.map((goal, i) => (
            <GoalRow
              key={i}
              goal={goal}
              readOnly={readOnly}
              flashing={flashIdx === i}
              onToggle={() => toggle(i)}
              onCommitText={(t) => commitText(i, t)}
              onQueue={() => queue(i)}
              onDelete={() => del(i)}
              onDragStart={() => setDragFrom(i)}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(i);
              }}
              onDrop={() => {
                if (dragFrom !== null) reorder(dragFrom, i);
                setDragFrom(null);
                setDragOver(null);
              }}
              isDragOver={dragOver === i}
            />
          ))}
        </ul>
      )}

      {goals.length > 5 ? (
        <button
          type="button"
          className="gm-showmore"
          onClick={() => setExpanded((e) => !e)}
        >
          {expanded ? "Show less ▴" : `Show ${goals.length - 5} more ▾`}
        </button>
      ) : null}

      {variant === "today" && remaining > 0 ? (
        <button type="button" className="gm-push-btn" onClick={pushRemaining}>
          Push remaining to tomorrow
        </button>
      ) : null}

      <QuickAdd
        placeholder={
          variant === "today" ? "Add a goal for today…" : "Add a goal for tomorrow…"
        }
        onAdd={add}
      />
    </div>
  );
}

/** To Do List — Today + Plan Tomorrow cards, both backed by localStorage. */
export function TodoList() {
  const [mounted, setMounted] = useState(false);
  const [today, setToday] = useState<Goal[]>([]);
  const [tomorrow, setTomorrow] = useState<Goal[]>([]);
  const [streak, setStreak] = useState(0);
  const keys = useRef({ today: "", tomorrow: "" });

  useEffect(() => {
    function reload() {
      keys.current.today = goalsKey(getActiveDateString());
      keys.current.tomorrow = goalsKey(getTomorrowDateString());
      setToday(readGoals(keys.current.today));
      setTomorrow(readGoals(keys.current.tomorrow));
      setStreak(getStreak());
    }
    reload();
    setMounted(true);
    window.addEventListener(GOALS_CHANGED_EVENT, reload);
    return () => window.removeEventListener(GOALS_CHANGED_EVENT, reload);
  }, []);

  // Render date/storage-derived content only on the client to avoid hydration
  // mismatches (the active date and goal data are client-only).
  if (!mounted) {
    return (
      <div className="section">
        <div className="section-title">To Do List</div>
      </div>
    );
  }

  return (
    <div className="section">
      <div className="section-title">To Do List</div>
      <GoalCard
        variant="today"
        goals={today}
        dateKey={keys.current.today}
        otherKey={keys.current.tomorrow}
        streak={streak}
      />
      <GoalCard
        variant="tomorrow"
        goals={tomorrow}
        dateKey={keys.current.tomorrow}
        otherKey={keys.current.today}
        streak={streak}
      />
    </div>
  );
}
