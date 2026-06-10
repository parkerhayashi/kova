"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import type { Exercise, ExerciseCatalogItem } from "@/types";

type SearchPayload = {
  local: Exercise[];
  catalog: ExerciseCatalogItem[];
};

export function ExerciseSearchModal({
  title,
  onClose,
  onSelect,
}: {
  title: string;
  onClose: () => void;
  onSelect: (exerciseId: string) => void | Promise<void>;
}) {
  const [searchQ, setSearchQ] = useState("");
  const [local, setLocal] = useState<Exercise[]>([]);
  const [catalog, setCatalog] = useState<ExerciseCatalogItem[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void search("");
  }, []);

  async function search(q: string) {
    setSearchQ(q);
    const res = await fetch(`/api/workouts/exercises?q=${encodeURIComponent(q)}`);
    if (!res.ok) return;
    const json = (await res.json()) as SearchPayload;
    setLocal(json.local ?? []);
    setCatalog(json.catalog ?? []);
  }

  async function pickLocal(id: string) {
    setBusy(true);
    try {
      await onSelect(id);
    } finally {
      setBusy(false);
    }
  }

  async function pickCatalog(exercisedbId: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/workouts/exercises", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exercisedb_id: exercisedbId }),
      });
      if (!res.ok) return;
      const json = (await res.json()) as { exercise: Exercise };
      await onSelect(json.exercise.id);
    } finally {
      setBusy(false);
    }
  }

  const empty = local.length === 0 && catalog.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <Card className="max-h-[80vh] w-full max-w-md overflow-y-auto">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-medium text-text-primary">{title}</h3>
          <button
            type="button"
            className="text-text-muted hover:text-text-primary"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <Input
          placeholder="Search 1,500+ exercises…"
          value={searchQ}
          onChange={(e) => void search(e.target.value)}
          autoFocus
        />

        {local.length > 0 ? (
          <div className="mt-4">
            <p className="metric-label mb-2">Your library</p>
            <ul className="space-y-1">
              {local.map((item) => (
                <li key={item.id}>
                  <ExerciseSearchRow
                    name={item.name}
                    gifUrl={item.gif_url}
                    meta={item.equipment}
                    disabled={busy}
                    onClick={() => void pickLocal(item.id)}
                  />
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {catalog.length > 0 ? (
          <div className="mt-4">
            <p className="metric-label mb-2">ExerciseDB</p>
            <ul className="space-y-1">
              {catalog.map((item) => (
                <li key={item.exercisedb_id}>
                  <ExerciseSearchRow
                    name={item.name}
                    gifUrl={item.gif_url}
                    meta={[item.equipment, item.target_muscle]
                      .filter(Boolean)
                      .join(" · ")}
                    disabled={busy}
                    onClick={() => void pickCatalog(item.exercisedb_id)}
                  />
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {empty && searchQ.trim() ? (
          <p className="body-copy mt-4 text-sm text-text-muted">No matches.</p>
        ) : null}

        {empty && !searchQ.trim() ? (
          <p className="body-copy mt-4 text-sm text-text-muted">
            Type to search your library and ExerciseDB.
          </p>
        ) : null}
      </Card>
    </div>
  );
}

function ExerciseSearchRow({
  name,
  gifUrl,
  meta,
  disabled,
  onClick,
}: {
  name: string;
  gifUrl?: string | null;
  meta?: string | null;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-[rgba(255,255,255,0.06)]",
        disabled && "opacity-50",
      )}
      onClick={onClick}
    >
      {gifUrl ? (
        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-border bg-[#0a0a0a]">
          <Image
            src={gifUrl}
            alt=""
            fill
            unoptimized
            className="object-cover"
            sizes="40px"
          />
        </div>
      ) : (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-[rgba(255,255,255,0.04)] text-sm">
          {name.charAt(0)}
        </div>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-text-primary">{name}</span>
        {meta ? (
          <span className="block truncate text-xs text-text-muted">{meta}</span>
        ) : null}
      </span>
    </button>
  );
}
