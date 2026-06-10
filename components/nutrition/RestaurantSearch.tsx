"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Search, Store } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { FoodDetailPanel } from "@/components/nutrition/FoodDetailPanel";
import type { Restaurant, RestaurantItem } from "@/lib/restaurants";
import type { NutrientProfile } from "@/types";

export function RestaurantSearch({ date }: { date: string }) {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [restaurantId, setRestaurantId] = useState("");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<RestaurantItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [bootLoading, setBootLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<NutrientProfile | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/nutrition/restaurants");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load restaurants");
        setRestaurants(data.restaurants ?? []);
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
        if (restaurantId) params.set("restaurant", restaurantId);
        const res = await fetch(`/api/nutrition/restaurants?${params}`);
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
  }, [query, restaurantId]);

  async function pickItem(id: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/nutrition/restaurants?id=${encodeURIComponent(id)}`,
      );
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
        <span className="metric-label">Add food · Restaurants</span>

        {bootLoading ? (
          <div className="text-text-muted flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" />
            Loading restaurants…
          </div>
        ) : restaurants.length === 0 ? (
          <p className="text-text-muted flex items-center gap-2 text-sm">
            <Store className="size-4 shrink-0" />
            No restaurants in the catalog yet — add chain data under{" "}
            <code className="text-xs">data/restaurants/chains/</code> and run{" "}
            <code className="text-xs">npm run restaurants:sync</code>.
          </p>
        ) : (
          <>
            <select
              value={restaurantId}
              onChange={(e) => setRestaurantId(e.target.value)}
              className="border-border-strong bg-surface w-full rounded-lg border px-3 py-2 text-sm"
            >
              <option value="">All restaurants</option>
              {restaurants.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.itemCount})
                </option>
              ))}
            </select>

            <div className="relative">
              <Search className="text-text-muted pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search menu items…"
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
                  <span className="text-text-muted ml-2 text-xs">{hit.restaurant}</span>
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
        ) : query.trim().length >= 2 && !loading && restaurants.length > 0 ? (
          <p className="text-text-muted flex items-center gap-2 text-xs">
            <Store className="size-3.5" />
            No matches — try another restaurant or search term.
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
