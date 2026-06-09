"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Input";
import {
  SUBSTANCE_DB,
  WATER_LS_KEY,
  fmtMl,
  normalizeWater,
  subExtraMl,
  type WaterState,
  type WaterUnit,
  type WeightUnit,
  type Sex,
} from "@/lib/water";

function Seg<T extends string>({
  value,
  options,
  onPick,
}: {
  value: T;
  options: { v: T; label: string }[];
  onPick: (v: T) => void;
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

export function WaterSettings({
  state,
  onChange,
}: {
  state: WaterState;
  onChange: (next: WaterState) => void;
}) {
  const [query, setQuery] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function set(patch: Partial<WaterState>) {
    onChange({ ...state, ...patch });
  }
  function setProfile(patch: Partial<WaterState["profile"]>) {
    onChange({ ...state, profile: { ...state.profile, ...patch } });
  }

  const matches = query.trim()
    ? SUBSTANCE_DB.filter(
        (s) =>
          s.name.toLowerCase().includes(query.trim().toLowerCase()) ||
          s.cat.toLowerCase().includes(query.trim().toLowerCase()),
      ).slice(0, 8)
    : [];

  function addSubstance(id: string) {
    const sub = SUBSTANCE_DB.find((x) => x.id === id);
    if (!sub) return;
    if (state.substances.some((x) => x.id === id)) return;
    set({ substances: [...state.substances, { ...sub, dose: sub.defaultDose }] });
    setQuery("");
  }
  function setDose(id: string, dose: number) {
    set({
      substances: state.substances.map((s) => (s.id === id ? { ...s, dose } : s)),
    });
  }
  function removeSubstance(id: string) {
    set({ substances: state.substances.filter((s) => s.id !== id) });
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kova-water-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  function importJson(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!confirm("Replace ALL current water data with the imported file?")) return;
        onChange(normalizeWater(parsed));
      } catch (err) {
        alert("Import failed: " + (err as Error).message);
      }
    };
    reader.readAsText(file);
  }
  function resetAll() {
    if (!confirm("Wipe ALL water logs and settings? This cannot be undone.")) return;
    if (typeof window !== "undefined") window.localStorage.removeItem(WATER_LS_KEY);
    onChange(normalizeWater(null));
  }

  const sectionTitle = "text-text-muted mb-2 text-[11px] font-bold uppercase tracking-[0.14em]";

  return (
    <Card className="space-y-6">
      {/* Profile — synced with Settings → Profile and Coach weight log */}
      <div>
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h4 className={sectionTitle.replace("mb-2 ", "")}>Profile</h4>
          <Link
            href="/settings/profile"
            className="text-text-muted hover:text-text-secondary text-[11px]"
          >
            Open profile →
          </Link>
        </div>
        <p className="text-text-muted mb-3 text-[11px] leading-relaxed">
          Age, sex, and weight sync with your Kova profile. Weight also logs to
          Coach when you change it here.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Weight">
            <Input
              type="number"
              step="0.5"
              value={state.profile.weightKg}
              onChange={(e) => setProfile({ weightKg: Number(e.target.value) || 0 })}
            />
          </Field>
          <Field label="Weight unit">
            <Seg<WeightUnit>
              value={state.weightUnit}
              options={[
                { v: "kg", label: "kg" },
                { v: "lb", label: "lb" },
              ]}
              onPick={(v) => set({ weightUnit: v })}
            />
          </Field>
          <Field label="Age">
            <Input
              type="number"
              value={state.profile.age}
              onChange={(e) => setProfile({ age: Number(e.target.value) || 0 })}
            />
          </Field>
          <Field label="Sex">
            <Seg<Sex>
              value={state.profile.sex}
              options={[
                { v: "m", label: "Male" },
                { v: "f", label: "Female" },
                { v: "o", label: "Other" },
              ]}
              onPick={(v) => setProfile({ sex: v })}
            />
          </Field>
          <Field label="Activity (training h/week)" className="col-span-2">
            <Input
              type="number"
              step="0.5"
              value={state.profile.activityHrsPerWeek}
              onChange={(e) => setProfile({ activityHrsPerWeek: Number(e.target.value) || 0 })}
            />
          </Field>
        </div>
      </div>

      {/* Display */}
      <div>
        <h4 className={sectionTitle}>Display</h4>
        <Field label="Show water as">
          <Seg<WaterUnit>
            value={state.unit}
            options={[
              { v: "bottle", label: "Bottles" },
              { v: "glass", label: "Glasses" },
              { v: "oz", label: "oz" },
              { v: "ml", label: "ml" },
            ]}
            onPick={(v) => set({ unit: v })}
          />
        </Field>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field label="Bottle size (ml)">
            <Input
              type="number"
              step="50"
              value={state.bottleMl}
              onChange={(e) => set({ bottleMl: Number(e.target.value) || 500 })}
            />
          </Field>
          <Field label="Glass size (ml)">
            <Input
              type="number"
              step="10"
              value={state.glassMl}
              onChange={(e) => set({ glassMl: Number(e.target.value) || 250 })}
            />
          </Field>
        </div>
      </div>

      {/* Caffeine */}
      <div>
        <h4 className={sectionTitle}>Caffeine</h4>
        <Field label="Average caffeine per day (mg)">
          <Input
            type="number"
            step="10"
            value={state.caffeineMgPerDay}
            onChange={(e) => set({ caffeineMgPerDay: Number(e.target.value) || 0 })}
          />
        </Field>
        <p className="text-text-muted mt-1.5 text-[11px] leading-relaxed">
          ~1 cup coffee = 95 mg · espresso = 75 mg · energy drink = 160 mg. Above 200
          mg/day adds a small water requirement.
        </p>
      </div>

      {/* Stimulants & meds */}
      <div>
        <h4 className={sectionTitle}>Stimulants &amp; meds</h4>
        <div className="relative">
          <Search
            className="text-text-muted pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2"
            strokeWidth={1.5}
          />
          <Input
            className="pl-9"
            placeholder="Search (Adderall, Concerta, Lithium…)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {matches.length > 0 ? (
            <ul className="border-border bg-surface-raised absolute top-full z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border py-1 shadow-xl">
              {matches.map((s) => {
                const already = state.substances.some((x) => x.id === s.id);
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      disabled={already}
                      onClick={() => addSubstance(s.id)}
                      className="flex w-full flex-col gap-0.5 px-3 py-2 text-left hover:bg-[rgba(255,255,255,0.05)] disabled:opacity-40"
                    >
                      <span className="text-text-primary text-sm font-semibold">
                        {s.name} {already ? "" : <span style={{ color: "var(--color-recovery)" }}>+</span>}
                      </span>
                      <span className="text-text-muted font-mono text-[10.5px]">
                        {s.cat} · {s.defaultDose} {s.unit} → ~{fmtMl(s.defaultDose * s.mlPerUnit)}/day
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>

        <div className="mt-3 space-y-1.5">
          {state.substances.map((s) => (
            <div
              key={s.id}
              className="border-border flex flex-wrap items-center gap-2.5 rounded-lg border bg-[rgba(255,255,255,0.02)] px-3 py-2.5"
            >
              <div className="min-w-[140px] flex-1">
                <p className="text-text-primary text-[13px] font-semibold">{s.name}</p>
                <p className="text-text-muted font-mono text-[11px] tabular-nums">
                  + {fmtMl(subExtraMl(s))} / day · {s.cat}
                </p>
              </div>
              <div className="border-border flex items-center gap-1.5 rounded-lg border bg-[rgba(0,0,0,0.3)] px-2 py-1">
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={s.dose}
                  onChange={(e) => setDose(s.id, Number(e.target.value) || 0)}
                  className="text-text-primary w-14 bg-transparent text-center text-sm font-semibold tabular-nums outline-none"
                />
                <span className="text-text-muted font-mono text-[11px]">{s.unit}</span>
              </div>
              <button
                type="button"
                onClick={() => removeSubstance(s.id)}
                aria-label="Remove"
                className="text-text-muted hover:text-[color:var(--color-stress)]"
              >
                <X className="size-4" />
              </button>
            </div>
          ))}
          {state.substances.length === 0 ? (
            <p className="text-text-muted py-2 text-center text-xs italic">
              No substances added.
            </p>
          ) : null}
        </div>
      </div>

      {/* Data */}
      <div>
        <h4 className={sectionTitle}>Data</h4>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={exportJson}
            className="border-border-strong text-text-primary rounded-lg border bg-[rgba(255,255,255,0.04)] px-4 py-2 text-[13px] font-semibold hover:bg-[rgba(255,255,255,0.08)]"
          >
            Export JSON
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="border-border-strong text-text-primary rounded-lg border bg-[rgba(255,255,255,0.04)] px-4 py-2 text-[13px] font-semibold hover:bg-[rgba(255,255,255,0.08)]"
          >
            Import JSON
          </button>
          <button
            type="button"
            onClick={resetAll}
            className="rounded-lg border px-4 py-2 text-[13px] font-semibold"
            style={{ color: "var(--color-stress)", borderColor: "rgba(255,107,107,0.3)" }}
          >
            Reset all
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importJson(f);
              e.target.value = "";
            }}
          />
        </div>
      </div>
    </Card>
  );
}
