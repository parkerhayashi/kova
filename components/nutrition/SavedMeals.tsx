"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2, Plus, Trash2, UtensilsCrossed } from "lucide-react";
import {
  deleteSavedMealAction,
  logSavedMealAction,
  saveSavedMealAction,
} from "@/app/(dashboard)/nutrition/actions";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Input";
import {
  profileToComponent,
  savedMealTotalsLabel,
  sumSavedMealComponents,
} from "@/lib/saved-meals";
import type { DukeDiningItem, DukeDiningLocation } from "@/lib/duke-dining";
import type { Restaurant, RestaurantItem } from "@/lib/restaurants";
import type { NutrientProfile, SavedMeal, SavedMealComponent } from "@/types";

function ManualComponentForm({
  onAdd,
}: {
  onAdd: (component: SavedMealComponent) => void;
}) {
  const [name, setName] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onAdd({
      name: trimmed,
      source: "manual",
      servings: 1,
      nutrients: {
        calories: calories ? Number(calories) : undefined,
        protein_g: protein ? Number(protein) : undefined,
        carbs_g: carbs ? Number(carbs) : undefined,
        fat_g: fat ? Number(fat) : undefined,
      },
    });
    setName("");
    setCalories("");
    setProtein("");
    setCarbs("");
    setFat("");
  }

  return (
    <div className="border-border space-y-2 rounded-lg border p-3">
      <span className="metric-label">Manual item</span>
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Chipotle chicken bowl"
      />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Input
          type="number"
          value={calories}
          onChange={(e) => setCalories(e.target.value)}
          placeholder="kcal"
        />
        <Input
          type="number"
          value={protein}
          onChange={(e) => setProtein(e.target.value)}
          placeholder="protein g"
        />
        <Input
          type="number"
          value={carbs}
          onChange={(e) => setCarbs(e.target.value)}
          placeholder="carbs g"
        />
        <Input
          type="number"
          value={fat}
          onChange={(e) => setFat(e.target.value)}
          placeholder="fat g"
        />
      </div>
      <Button type="button" onClick={submit} disabled={!name.trim()}>
        Add item
      </Button>
    </div>
  );
}

function UsdaQuickAdd({
  onAdd,
}: {
  onAdd: (component: SavedMealComponent) => void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<
    { fdcId: number; name: string; brand: string | null }[]
  >([]);
  const [loading, setLoading] = useState(false);

  async function search(q: string) {
    setQuery(q);
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/nutrition/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setHits(data.foods ?? []);
    } finally {
      setLoading(false);
    }
  }

  async function pick(fdcId: number) {
    setLoading(true);
    try {
      const res = await fetch(`/api/nutrition/food?fdcId=${fdcId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Lookup failed");
      onAdd(profileToComponent(data.profile as NutrientProfile, 1));
      setQuery("");
      setHits([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border-border space-y-2 rounded-lg border p-3">
      <span className="metric-label">USDA search</span>
      <Input
        value={query}
        onChange={(e) => search(e.target.value)}
        placeholder="Search to add an item…"
      />
      {loading ? (
        <Loader2 className="text-text-muted size-4 animate-spin" />
      ) : null}
      {hits.length > 0 ? (
        <ul className="border-border max-h-32 divide-y overflow-y-auto rounded-lg border">
          {hits.map((hit) => (
            <li key={hit.fdcId}>
              <button
                type="button"
                onClick={() => pick(hit.fdcId)}
                className="hover:bg-surface-raised w-full px-3 py-2 text-left text-sm"
              >
                {hit.name}
                {hit.brand ? (
                  <span className="text-text-muted ml-2 text-xs">{hit.brand}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function DukeDiningQuickAdd({
  onAdd,
}: {
  onAdd: (component: SavedMealComponent) => void;
}) {
  const [locations, setLocations] = useState<DukeDiningLocation[]>([]);
  const [locationId, setLocationId] = useState("");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<DukeDiningItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [bootLoading, setBootLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  async function search(q: string, location: string) {
    setQuery(q);
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ q });
      if (location) params.set("location", location);
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
  }

  async function pick(id: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/nutrition/duke?id=${encodeURIComponent(id)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Lookup failed");
      onAdd(profileToComponent(data.profile as NutrientProfile, 1));
      setQuery("");
      setHits([]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border-border space-y-2 rounded-lg border p-3">
      <span className="metric-label">Duke dining</span>
      {bootLoading ? (
        <div className="text-text-muted flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" />
          Loading campus spots…
        </div>
      ) : (
        <>
          <select
            value={locationId}
            onChange={(e) => {
              const next = e.target.value;
              setLocationId(next);
              if (query.trim().length >= 2) void search(query, next);
            }}
            className="border-border-strong bg-surface w-full rounded-lg border px-3 py-2 text-sm"
          >
            <option value="">All locations</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name} ({loc.itemCount})
              </option>
            ))}
          </select>
          <Input
            value={query}
            onChange={(e) => search(e.target.value, locationId)}
            placeholder="Search campus menus…"
          />
        </>
      )}
      {loading ? (
        <Loader2 className="text-text-muted size-4 animate-spin" />
      ) : null}
      {error ? <p className="text-xs text-[var(--color-stress)]">{error}</p> : null}
      {hits.length > 0 ? (
        <ul className="border-border max-h-32 divide-y overflow-y-auto rounded-lg border">
          {hits.map((hit) => (
            <li key={hit.id}>
              <button
                type="button"
                onClick={() => pick(hit.id)}
                className="hover:bg-surface-raised w-full px-3 py-2 text-left text-sm"
              >
                {hit.name}
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
    </div>
  );
}

function RestaurantQuickAdd({
  onAdd,
}: {
  onAdd: (component: SavedMealComponent) => void;
}) {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [restaurantId, setRestaurantId] = useState("");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<RestaurantItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [bootLoading, setBootLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  async function search(q: string, restaurant: string) {
    setQuery(q);
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ q });
      if (restaurant) params.set("restaurant", restaurant);
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
  }

  async function pick(id: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/nutrition/restaurants?id=${encodeURIComponent(id)}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Lookup failed");
      onAdd(profileToComponent(data.profile as NutrientProfile, 1));
      setQuery("");
      setHits([]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (!bootLoading && restaurants.length === 0) return null;

  return (
    <div className="border-border space-y-2 rounded-lg border p-3">
      <span className="metric-label">Restaurants</span>
      {bootLoading ? (
        <div className="text-text-muted flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" />
          Loading restaurants…
        </div>
      ) : (
        <>
          <select
            value={restaurantId}
            onChange={(e) => {
              const next = e.target.value;
              setRestaurantId(next);
              if (query.trim().length >= 2) void search(query, next);
            }}
            className="border-border-strong bg-surface w-full rounded-lg border px-3 py-2 text-sm"
          >
            <option value="">All restaurants</option>
            {restaurants.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.itemCount})
              </option>
            ))}
          </select>
          <Input
            value={query}
            onChange={(e) => search(e.target.value, restaurantId)}
            placeholder="Search menu items…"
          />
        </>
      )}
      {loading ? (
        <Loader2 className="text-text-muted size-4 animate-spin" />
      ) : null}
      {error ? <p className="text-xs text-[var(--color-stress)]">{error}</p> : null}
      {hits.length > 0 ? (
        <ul className="border-border max-h-32 divide-y overflow-y-auto rounded-lg border">
          {hits.map((hit) => (
            <li key={hit.id}>
              <button
                type="button"
                onClick={() => pick(hit.id)}
                className="hover:bg-surface-raised w-full px-3 py-2 text-left text-sm"
              >
                {hit.name}
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
      ) : query.trim().length >= 2 && !loading ? (
        <p className="text-text-muted text-xs">No matches — try another restaurant.</p>
      ) : null}
    </div>
  );
}

function SavedMealBuilder({
  initial,
  onDone,
  onCancel,
}: {
  initial?: SavedMeal;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [components, setComponents] = useState<SavedMealComponent[]>(
    initial?.components ?? [],
  );
  const [showAdd, setShowAdd] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const totalsLabel = useMemo(
    () => savedMealTotalsLabel(components),
    [components],
  );

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        await saveSavedMealAction({
          id: initial?.id,
          name,
          components,
        });
        onDone();
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  return (
    <Card className="space-y-4">
      <div>
        <span className="metric-label">
          {initial ? "Edit saved meal" : "New saved meal"}
        </span>
        <Field label="Name" className="mt-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Greek yogurt bowl, Chipotle order…"
          />
        </Field>
      </div>

      {components.length > 0 ? (
        <ul className="border-border divide-y rounded-lg border">
          {components.map((component, idx) => (
            <li
              key={`${component.name}-${idx}`}
              className="flex items-center gap-3 px-3 py-2.5 text-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="text-text-primary truncate">{component.name}</p>
                <p className="text-text-muted text-xs">
                  {savedMealTotalsLabel([component])}
                </p>
              </div>
              <Input
                type="number"
                min={0.25}
                step={0.25}
                value={component.servings}
                onChange={(e) => {
                  const servings = Number(e.target.value) || 1;
                  setComponents((prev) =>
                    prev.map((c, i) => (i === idx ? { ...c, servings } : c)),
                  );
                }}
                className="w-16"
              />
              <button
                type="button"
                onClick={() =>
                  setComponents((prev) => prev.filter((_, i) => i !== idx))
                }
                className="text-text-muted hover:text-[var(--color-stress)] p-1"
                aria-label={`Remove ${component.name}`}
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-text-muted text-sm">
          Add items from Duke dining, restaurants, USDA search, or enter macros manually.
        </p>
      )}

      <button
        type="button"
        onClick={() => setShowAdd((s) => !s)}
        className="text-text-muted hover:text-text-secondary flex items-center gap-2 text-xs"
      >
        <Plus className="size-3.5" />
        Add item
        <ChevronDown
          className={`size-4 transition-transform ${showAdd ? "rotate-180" : ""}`}
        />
      </button>

      {showAdd ? (
        <div className="space-y-3">
          <DukeDiningQuickAdd
            onAdd={(component) => {
              setComponents((prev) => [...prev, component]);
              setShowAdd(false);
            }}
          />
          <RestaurantQuickAdd
            onAdd={(component) => {
              setComponents((prev) => [...prev, component]);
              setShowAdd(false);
            }}
          />
          <UsdaQuickAdd
            onAdd={(component) => {
              setComponents((prev) => [...prev, component]);
              setShowAdd(false);
            }}
          />
          <ManualComponentForm
            onAdd={(component) => {
              setComponents((prev) => [...prev, component]);
              setShowAdd(false);
            }}
          />
        </div>
      ) : null}

      <div className="border-border border-t pt-3">
        <p className="text-text-muted text-xs">Total</p>
        <p className="text-text-primary mt-0.5 text-sm tabular-nums">{totalsLabel}</p>
        {error ? (
          <p className="mt-2 text-xs text-[var(--color-stress)]">{error}</p>
        ) : null}
        <div className="mt-3 flex gap-3">
          <Button
            type="button"
            variant="primary"
            onClick={save}
            disabled={pending || !name.trim() || components.length === 0}
          >
            {pending ? "Saving…" : "Save meal"}
          </Button>
          <button
            type="button"
            onClick={onCancel}
            className="text-text-muted text-sm hover:text-text-secondary"
          >
            Cancel
          </button>
        </div>
      </div>
    </Card>
  );
}

export function SavedMeals({
  date,
  meals: initialMeals,
}: {
  date: string;
  meals: SavedMeal[];
}) {
  const router = useRouter();
  const [meals, setMeals] = useState(initialMeals);
  const [editing, setEditing] = useState<SavedMeal | "new" | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMeals(initialMeals);
  }, [initialMeals]);

  function logMeal(meal: SavedMeal) {
    setError(null);
    startTransition(async () => {
      try {
        await logSavedMealAction(meal.id, date);
        router.refresh();
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  function removeMeal(id: string) {
    if (!confirm("Delete this saved meal?")) return;
    setError(null);
    startTransition(async () => {
      try {
        await deleteSavedMealAction(id);
        setMeals((prev) => prev.filter((m) => m.id !== id));
        router.refresh();
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  if (editing) {
    return (
      <SavedMealBuilder
        initial={editing === "new" ? undefined : editing}
        onDone={() => {
          setEditing(null);
          router.refresh();
        }}
        onCancel={() => setEditing(null)}
      />
    );
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="metric-label">Saved meals</span>
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="text-text-muted hover:text-text-secondary inline-flex items-center gap-1 text-xs"
        >
          <Plus className="size-3.5" />
          New
        </button>
      </div>

      {error ? (
        <p className="text-xs text-[var(--color-stress)]">{error}</p>
      ) : null}

      {meals.length === 0 ? (
        <p className="text-text-muted flex items-center gap-2 text-sm">
          <UtensilsCrossed className="size-4 shrink-0" />
          Save combos you eat often — yogurt bowls, Chipotle orders, BYO pasta builds.
        </p>
      ) : (
        <ul className="divide-border divide-y">
          {meals.map((meal) => {
            const totals = sumSavedMealComponents(meal.components);
            return (
              <li
                key={meal.id}
                className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-text-primary text-sm">{meal.name}</p>
                  <p className="text-text-muted text-xs">
                    {meal.components.length} item{meal.components.length === 1 ? "" : "s"}
                    {totals.calories != null
                      ? ` · ${Math.round(totals.calories)} kcal`
                      : ""}
                    {totals.protein_g != null
                      ? ` · ${Math.round(totals.protein_g)}g P`
                      : ""}
                  </p>
                  <p className="text-text-muted mt-1 truncate text-xs">
                    {meal.components.map((c) => c.name).join(" + ")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="primary"
                    onClick={() => logMeal(meal)}
                    disabled={pending}
                  >
                    Log
                  </Button>
                  <button
                    type="button"
                    onClick={() => setEditing(meal)}
                    className="text-text-muted hover:text-text-secondary px-2 py-1 text-xs"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => removeMeal(meal.id)}
                    disabled={pending}
                    className="text-text-muted hover:text-[var(--color-stress)] p-1"
                    aria-label={`Delete ${meal.name}`}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
