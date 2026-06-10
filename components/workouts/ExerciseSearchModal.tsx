"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import type { Exercise } from "@/types";

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
  const [results, setResults] = useState<Exercise[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void search("");
  }, []);

  async function search(q: string) {
    setSearchQ(q);
    const res = await fetch(`/api/workouts/exercises?q=${encodeURIComponent(q)}`);
    if (!res.ok) return;
    const json = await res.json();
    setResults(json.exercises ?? []);
  }

  async function pick(id: string) {
    setBusy(true);
    try {
      await onSelect(id);
    } finally {
      setBusy(false);
    }
  }

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
          placeholder="Search exercises…"
          value={searchQ}
          onChange={(e) => void search(e.target.value)}
          autoFocus
        />
        <ul className="mt-3 space-y-1">
          {results.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                disabled={busy}
                className={cn(
                  "w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[rgba(255,255,255,0.06)]",
                  busy && "opacity-50",
                )}
                onClick={() => void pick(item.id)}
              >
                {item.name}
                {item.equipment ? (
                  <span className="text-text-muted"> · {item.equipment}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
