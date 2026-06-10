"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Search, UtensilsCrossed } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { FoodDetailPanel } from "@/components/nutrition/FoodDetailPanel";
import type { DukeDiningItem, DukeDiningLocation } from "@/lib/duke-dining";
import type { NutrientProfile } from "@/types";

export function DukeDiningSearch({ date }: { date: string }) {
  const [locations, setLocations] = useState<DukeDiningLocation[]>([]);
  const [locationId, setLocationId] = useState("");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<DukeDiningItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [bootLoading, setBootLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<NutrientProfile | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/nutrition/duke");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load Duke dining");
        setLocations(data.locations ?? []);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBootLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    debounce.current = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ q });
        if (locationId) params.set("location", locationId);
        const res = await fetch(`/api/nutrition/duke?${params}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Search failed");
        setHits(data.items ?? []);
      } catch (err) {
        setError((err as Error).message);
        setHits([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query, locationId]);

  async function pickItem(id: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/nutrition/duke?id=${encodeURIComponent(id)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Lookup failed");
      setProfile(data.profile);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <Card className="space-y-3">
        <span className="metric-label">Add food · Duke dining</span>

        {bootLoading ? (
          <div className="text-text-muted flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" />
            Loading campus spots…
          </div>
        ) : (
          <>
            <select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className="border-border-strong bg-surface w-full rounded-lg border px-3 py-2 text-sm"
            >
              <option value="">All locations</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name} ({loc.itemCount})
                </option>
              ))}
            </select>

            <div className="relative">
              <Search className="text-text-muted pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search campus menus…"
                className="border-border-strong bg-surface w-full rounded-lg border py-2 pl-9 pr-3 text-sm"
              />
              {loading ? (
                <Loader2 className="text-text-muted absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin" />
              ) : null}
            </div>
          </>
        )}

        {error ? <p className="text-xs text-[var(--color-stress)]">{error}</p> : null}

        {hits.length > 0 ? (
          <ul className="border-border max-h-48 divide-y overflow-y-auto rounded-lg border">
            {hits.map((hit) => (
              <li key={hit.id}>
                <button
                  type="button"
                  onClick={() => pickItem(hit.id)}
                  className={`hover:bg-surface-raised w-full px-3 py-2.5 text-left text-sm transition-colors ${
                    profile?.food_id === hit.id
                      ? "bg-[rgba(255,255,255,0.06)]"
                      : ""
                  }`}
                >
                  <span className="text-text-primary">{hit.name}</span>
                  <span className="text-text-muted ml-2 text-xs">{hit.location}</span>
                  {hit.nutrients.calories != null ? (
                    <span
                      className="ml-2 text-xs tabular-nums"
                      style={{ color: "var(--color-nutrition)" }}
                    >
                      {Math.round(hit.nutrients.calories)} kcal
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        ) : query.trim().length >= 2 && !loading ? (
          <p className="text-text-muted flex items-center gap-2 text-xs">
            <UtensilsCrossed className="size-3.5" />
            No matches — try another spot or search term.
          </p>
        ) : null}
      </Card>

      {profile ? (
        <FoodDetailPanel
          profile={profile}
          date={date}
          onDone={() => {
            setProfile(null);
            setQuery("");
            setHits([]);
          }}
          onCancel={() => setProfile(null)}
        />
      ) : null}
    </div>
  );
}
