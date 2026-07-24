"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  retakeBodyFatEyeTestAction,
  saveBodyFatEyeTestAction,
} from "@/app/(dashboard)/weight/actions";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { BodyFatEstimateView } from "@/lib/body-fat-estimate";
import type {
  VisualBodyFatAbs,
  VisualBodyFatAnswers,
  VisualBodyFatFace,
  VisualBodyFatLower,
  VisualBodyFatState,
  VisualBodyFatVeins,
} from "@/types";

const ABS_OPTIONS: { id: VisualBodyFatAbs; label: string }[] = [
  { id: "none", label: "No abs visible" },
  { id: "faint", label: "Faint outline" },
  { id: "clear", label: "Clear abs" },
  { id: "etched", label: "Very etched" },
];

const VEIN_OPTIONS: { id: VisualBodyFatVeins; label: string }[] = [
  { id: "none", label: "None" },
  { id: "arms", label: "Arms only" },
  { id: "shoulders", label: "Arms + shoulders" },
  { id: "widespread", label: "More widespread" },
];

const FACE_OPTIONS: { id: VisualBodyFatFace; label: string }[] = [
  { id: "soft", label: "Soft" },
  { id: "some", label: "Some definition" },
  { id: "sharp", label: "Sharp jaw / face" },
];

const LOWER_OPTIONS: { id: VisualBodyFatLower; label: string }[] = [
  { id: "soft", label: "Soft" },
  { id: "shape", label: "Some muscle shape" },
  { id: "clear", label: "Clear separation" },
];

function ChoiceRow<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: T; label: string }[];
  value: T | null;
  onChange: (id: T) => void;
}) {
  return (
    <div className="space-y-2">
      <span className="metric-label">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const active = value === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(opt.id)}
              className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                active
                  ? "border-border-strong bg-[rgba(255,255,255,0.1)] text-text-primary"
                  : "border-border text-text-muted hover:text-text-secondary"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function confidenceLabel(c: BodyFatEstimateView["confidence"]): string {
  if (c === "high") return "Higher confidence";
  if (c === "medium") return "Medium confidence";
  return "Low confidence";
}

export function BodyFatEstimate({
  initial,
}: {
  initial: BodyFatEstimateView;
}) {
  const router = useRouter();
  const [view, setView] = useState(initial);
  const [quizOpen, setQuizOpen] = useState(!initial.has_baseline);
  const [sex, setSex] = useState<VisualBodyFatState["sex"]>(
    initial.baseline?.sex ?? initial.suggested_sex,
  );
  const [answers, setAnswers] = useState<Partial<VisualBodyFatAnswers>>(
    initial.baseline?.answers ?? {},
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setView(initial);
    setQuizOpen(!initial.has_baseline);
  }, [initial]);

  const complete =
    answers.abs != null &&
    answers.veins != null &&
    answers.face != null &&
    answers.lower != null;

  function saveQuiz() {
    if (!complete) {
      setError("Answer all four questions.");
      return;
    }
    setError(null);
    startTransition(async () => {
      await saveBodyFatEyeTestAction({
        sex,
        answers: answers as VisualBodyFatAnswers,
      });
      setQuizOpen(false);
      router.refresh();
    });
  }

  function retake() {
    startTransition(async () => {
      await retakeBodyFatEyeTestAction();
      setAnswers({});
      setQuizOpen(true);
      router.refresh();
    });
  }

  if (quizOpen || !view.has_baseline) {
    return (
      <Card className="space-y-4">
        <div>
          <span className="metric-label">Body fat · eye test</span>
          <p className="text-text-muted mt-1 text-sm">
            Quick visual baseline (not a DEXA). Weight, lifts, and intake then
            update the estimate over time.
          </p>
        </div>

        <div className="space-y-2">
          <span className="metric-label">Sex (for visual ranges)</span>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["male", "Male"],
                ["female", "Female"],
                ["other", "Other / prefer not"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setSex(id)}
                className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                  sex === id
                    ? "border-border-strong bg-[rgba(255,255,255,0.1)] text-text-primary"
                    : "border-border text-text-muted hover:text-text-secondary"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <ChoiceRow
          label="Abs"
          options={ABS_OPTIONS}
          value={answers.abs ?? null}
          onChange={(abs) => setAnswers((a) => ({ ...a, abs }))}
        />
        <ChoiceRow
          label="Veins"
          options={VEIN_OPTIONS}
          value={answers.veins ?? null}
          onChange={(veins) => setAnswers((a) => ({ ...a, veins }))}
        />
        <ChoiceRow
          label="Face / jaw"
          options={FACE_OPTIONS}
          value={answers.face ?? null}
          onChange={(face) => setAnswers((a) => ({ ...a, face }))}
        />
        <ChoiceRow
          label="Legs / lower body"
          options={LOWER_OPTIONS}
          value={answers.lower ?? null}
          onChange={(lower) => setAnswers((a) => ({ ...a, lower }))}
        />

        {error ? (
          <p className="text-xs text-[var(--color-stress)]">{error}</p>
        ) : null}

        <Button type="button" variant="primary" onClick={saveQuiz} disabled={pending}>
          {pending ? "Saving…" : "Save baseline"}
        </Button>
      </Card>
    );
  }

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="metric-label">Body fat estimate</span>
          <p className="text-text-muted mt-1 text-xs">
            Visual baseline + weight / lifting / intake since then. Approximate.
          </p>
        </div>
        <button
          type="button"
          onClick={retake}
          disabled={pending}
          className="text-text-muted hover:text-text-secondary text-xs font-semibold"
        >
          Retake eye test
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        <div>
          <p
            className="metric-value text-3xl tabular-nums sm:text-4xl"
            style={{ color: "var(--color-activity)" }}
          >
            {view.current_pct != null ? `${view.current_pct}%` : "—"}
          </p>
          <p className="text-text-muted mt-1 text-xs">
            {view.band_low != null && view.band_high != null
              ? `Band ${view.band_low}–${view.band_high}% · ${confidenceLabel(view.confidence)}`
              : confidenceLabel(view.confidence)}
          </p>
        </div>
        <div className="pb-1 text-sm">
          <p className="font-semibold text-text-primary">{view.headline}</p>
          <p className="text-text-muted mt-1 text-xs">{view.detail}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Mini
          label="Fat mass"
          value={view.fat_lbs != null ? `${view.fat_lbs} lb` : "—"}
        />
        <Mini
          label="Lean mass"
          value={view.lean_lbs != null ? `${view.lean_lbs} lb` : "—"}
        />
        <Mini
          label="Δ muscle"
          value={
            view.est_muscle_lbs != null
              ? `${view.est_muscle_lbs > 0 ? "+" : ""}${view.est_muscle_lbs} lb`
              : "—"
          }
        />
        <Mini
          label="Δ fat"
          value={
            view.est_fat_lbs != null
              ? `${view.est_fat_lbs > 0 ? "+" : ""}${view.est_fat_lbs} lb`
              : "—"
          }
        />
      </div>
    </Card>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[rgba(255,255,255,0.03)] px-3 py-2.5">
      <span className="metric-label">{label}</span>
      <p className="mt-1 text-sm font-semibold tabular-nums text-text-primary">
        {value}
      </p>
    </div>
  );
}
