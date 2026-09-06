"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { updateProfile } from "@/app/(dashboard)/settings/profile/actions";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Input";
import {
  inchesToMeters,
  metersToInches,
  normalizeProfileSex,
} from "@/lib/profile";
import {
  DEFAULT_ACTIVITY_LEVEL,
  parseActivityLevel,
  type ActivityLevel,
} from "@/lib/nutrition-goals";
import type { UserProfile } from "@/types";

function Seg({
  value,
  options,
  onPick,
}: {
  value: string;
  options: { v: string; label: string }[];
  onPick: (v: string) => void;
}) {
  return (
    <div className="flex gap-1 rounded-lg border border-[color:var(--color-border)] bg-[rgba(255,255,255,0.04)] p-1">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onPick(o.v)}
          className={`flex-1 rounded-md px-2 py-2 text-xs font-semibold transition-colors ${
            value === o.v
              ? "bg-text-primary text-[#06080b]"
              : "text-text-muted hover:text-text-secondary"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function sourceNote(source: string | null): string | null {
  if (source === "oura") return "From Oura until you save here";
  if (source === "weight_log") return "From weight log";
  return null;
}

function normalizeSex(sex: string | null): string {
  return normalizeProfileSex(sex);
}

export function ProfileForm({ profile }: { profile: UserProfile }) {
  const [age, setAge] = useState(profile.age != null ? String(profile.age) : "");
  const [heightIn, setHeightIn] = useState(
    profile.height_m != null ? String(metersToInches(profile.height_m)) : "",
  );
  const [sex, setSex] = useState(normalizeSex(profile.biological_sex));
  const [activity, setActivity] = useState<ActivityLevel>(
    parseActivityLevel(profile.activity_level ?? DEFAULT_ACTIVITY_LEVEL),
  );
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      await updateProfile({
        age: age.trim() ? Number(age) : null,
        height_m: heightIn.trim() ? inchesToMeters(Number(heightIn)) : null,
        biological_sex: sex,
        activity_level: activity,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <div>
          <span className="metric-label">Body profile</span>
          <p className="body-copy mt-1 text-sm">
            Used for calorie targets, water needs, BMR, and protein goals across
            Kova. Weight comes from your daily log under Workouts → Body weight.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Age">
            <Input
              type="number"
              inputMode="numeric"
              placeholder="e.g. 32"
              value={age}
              onChange={(e) => setAge(e.target.value)}
            />
            {profile.sources.age === "oura" ? (
              <span className="timestamp">{sourceNote("oura")}</span>
            ) : null}
          </Field>
          <Field label="Height (in)">
            <Input
              type="number"
              step="0.5"
              inputMode="decimal"
              placeholder="e.g. 70"
              value={heightIn}
              onChange={(e) => setHeightIn(e.target.value)}
            />
            {profile.sources.height_m === "oura" ? (
              <span className="timestamp">{sourceNote("oura")}</span>
            ) : null}
          </Field>
          <Field label="Sex" className="sm:col-span-2">
            <Seg
              value={sex}
              options={[
                { v: "male", label: "Male" },
                { v: "female", label: "Female" },
                { v: "other", label: "Other" },
              ]}
              onPick={setSex}
            />
            {profile.sources.biological_sex === "oura" ? (
              <span className="timestamp">{sourceNote("oura")}</span>
            ) : null}
          </Field>
          <Field label="Activity level" className="sm:col-span-2">
            <Seg
              value={activity}
              options={[
                { v: "sedentary", label: "Sedentary" },
                { v: "light", label: "Light" },
                { v: "moderate", label: "Moderate" },
                { v: "high", label: "High" },
              ]}
              onPick={(v) => setActivity(parseActivityLevel(v))}
            />
            <p className="text-text-muted mt-1 text-xs">
              Used for TDEE (BMR × activity). Moderate matches typical gym + desk
              days; lower it if weight stalls above target.
            </p>
          </Field>
        </div>

        <div className="border-border border-t pt-3">
          <span className="metric-label">Current weight</span>
          <p className="text-text-primary mt-1 text-sm tabular-nums">
            {profile.weight_lbs != null
              ? `${Math.round(profile.weight_lbs * 10) / 10} lb`
              : "Not logged yet"}
            {profile.body_fat_pct != null
              ? ` · ${Math.round(profile.body_fat_pct * 10) / 10}% body fat`
              : ""}
          </p>
          <p className="text-text-muted mt-1 text-xs">
            {sourceNote(profile.sources.weight_lbs) ?? "Log weight under Workouts → Body weight"}
            {profile.sources.body_fat_pct === "visual" ? (
              <> · Body fat from Weight eye-test estimate</>
            ) : null}
            {profile.sources.weight_lbs !== "weight_log" ? (
              <>
                {" · "}
                <Link href="/workouts/body" className="hover:text-text-secondary underline-offset-2 hover:underline">
                  Log weight
                </Link>
              </>
            ) : null}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button type="button" onClick={handleSave} disabled={pending}>
            {pending ? "Saving…" : "Save profile"}
          </Button>
          {saved ? <span className="timestamp">Saved</span> : null}
        </div>
      </Card>
    </div>
  );
}
