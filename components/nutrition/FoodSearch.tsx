"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, Search } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { FoodDetailPanel } from "@/components/nutrition/FoodDetailPanel";
import type { NutrientProfile } from "@/types";

interface UsdaHit {
  source: "usda";
  fdcId: number;
  name: string;
  brand: string | null;
  dataType: string | null;
}

interface OffHit {
  source: "off";
  code: string;
  name: string;
  brand: string | null;
  calories: number | null;
}

export function FoodSearch({ date }: { date: string }) {
  const [query, setQuery] = useState("");
  const [usdaHits, setUsdaHits] = useState<UsdaHit[]>([]);
  const [offHits, setOffHits] = useState<OffHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<NutrientProfile | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    const q = query.trim();
    if (q.length < 2) {
      setUsdaHits([]);
      setOffHits([]);
      return;
    }
    debounce.current = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/nutrition/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Search failed");
        setUsdaHits(
          (data.foods ?? []).map(
            (hit: Omit<UsdaHit, "source">): UsdaHit => ({ ...hit, source: "usda" }),
          ),
        );
        setOffHits(
          (data.off ?? []).map(
            (hit: Omit<OffHit, "source">): OffHit => ({ ...hit, source: "off" }),
          ),
        );
      } catch (err) {
        setError((err as Error).message);
        setUsdaHits([]);
        setOffHits([]);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query]);

  async function pickUsda(fdcId: number) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/nutrition/food?fdcId=${fdcId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Lookup failed");
      setProfile(data.profile);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function pickOff(code: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/nutrition/barcode?code=${encodeURIComponent(code)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Lookup failed");
      setProfile(data.profile);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const hasHits = usdaHits.length > 0 || offHits.length > 0;

  return (
    <div className="space-y-3">
      <Card className="space-y-3">
        <span className="metric-label">Add food · USDA + Open Food Facts</span>
        <div className="relative">
          <Search className="text-text-muted pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search foods…"
            className="border-border-strong bg-surface w-full rounded-lg border py-2 pl-9 pr-3 text-sm"
          />
          {loading ? (
            <Loader2 className="text-text-muted absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin" />
          ) : null}
        </div>

        {error ? <p className="text-xs text-[var(--color-stress)]">{error}</p> : null}

        {hasHits ? (
          <ul className="border-border max-h-56 divide-y overflow-y-auto rounded-lg border">
            {usdaHits.length > 0 ? (
              <>
                <li className="metric-label bg-[rgba(255,255,255,0.02)] px-3 py-1.5">
                  USDA
                </li>
                {usdaHits.map((hit) => (
                  <li key={`usda-${hit.fdcId}`}>
                    <button
                      type="button"
                      onClick={() => pickUsda(hit.fdcId)}
                      className={`hover:bg-surface-raised w-full px-3 py-2.5 text-left text-sm transition-colors ${
                        profile?.food_id === String(hit.fdcId)
                          ? "bg-[rgba(255,255,255,0.06)]"
                          : ""
                      }`}
                    >
                      <span className="text-text-primary">{hit.name}</span>
                      {hit.dataType ? (
                        <span className="text-text-muted ml-2 text-xs">{hit.dataType}</span>
                      ) : null}
                      {hit.brand ? (
                        <span className="text-text-muted ml-2 text-xs">{hit.brand}</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </>
            ) : null}
            {offHits.length > 0 ? (
              <>
                <li className="metric-label bg-[rgba(255,255,255,0.02)] px-3 py-1.5">
                  Open Food Facts
                </li>
                {offHits.map((hit) => (
                  <li key={`off-${hit.code}`}>
                    <button
                      type="button"
                      onClick={() => pickOff(hit.code)}
                      className={`hover:bg-surface-raised w-full px-3 py-2.5 text-left text-sm transition-colors ${
                        profile?.food_id === hit.code
                          ? "bg-[rgba(255,255,255,0.06)]"
                          : ""
                      }`}
                    >
                      <span className="text-text-primary">{hit.name}</span>
                      {hit.brand ? (
                        <span className="text-text-muted ml-2 text-xs">{hit.brand}</span>
                      ) : null}
                      {hit.calories != null ? (
                        <span className="text-text-muted ml-2 text-xs tabular-nums">
                          {hit.calories} kcal/100g
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </>
            ) : null}
          </ul>
        ) : null}

        {profile && !loading ? (
          <p className="text-text-muted text-xs">
            Review nutrition below, set servings, then log.
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
            setUsdaHits([]);
            setOffHits([]);
          }}
          onCancel={() => setProfile(null)}
        />
      ) : null}
    </div>
  );
}

export function BarcodeEntry({ date }: { date: string }) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<NutrientProfile | null>(null);
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanningRef = useRef(false);

  async function lookup(barcode: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/nutrition/barcode?code=${encodeURIComponent(barcode)}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Lookup failed");
      setProfile(data.profile);
      setCode("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function startScan() {
    if (!("BarcodeDetector" in window)) {
      setError("Barcode scan needs a supported browser (Safari 17+ or Chrome).");
      return;
    }
    setError(null);
    setScanning(true);
    scanningRef.current = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const detector = new window.BarcodeDetector({
        formats: ["ean_13", "ean_8", "upc_a", "upc_e"],
      });
      const tick = async () => {
        if (!videoRef.current || !scanningRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes[0]?.rawValue) {
            stopScan();
            await lookup(codes[0].rawValue);
            return;
          }
        } catch {
          /* keep scanning */
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } catch {
      setError("Camera access denied or unavailable.");
      stopScan();
    }
  }

  function stopScan() {
    scanningRef.current = false;
    setScanning(false);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  useEffect(() => () => stopScan(), []);

  return (
    <div className="space-y-3">
      <Card className="space-y-3">
        <span className="metric-label">Barcode · Open Food Facts</span>
        <div className="flex gap-2">
          <input
            type="text"
            inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Enter barcode"
            className="border-border-strong bg-surface min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => code.trim() && lookup(code.trim())}
            disabled={loading || !code.trim()}
            className="border-border-strong hover:bg-surface-raised shrink-0 rounded-lg border px-3 py-2 text-sm transition-colors disabled:opacity-50"
          >
            Look up
          </button>
          <button
            type="button"
            onClick={scanning ? stopScan : startScan}
            aria-label={scanning ? "Stop scan" : "Scan barcode"}
            className="border-border-strong hover:bg-surface-raised inline-flex size-10 shrink-0 items-center justify-center rounded-lg border transition-colors"
          >
            <Camera className={`size-4 ${scanning ? "text-[var(--color-recovery)]" : ""}`} />
          </button>
        </div>

        {scanning ? (
          <video
            ref={videoRef}
            className="border-border aspect-video w-full rounded-lg border object-cover"
            muted
            playsInline
          />
        ) : null}

        {error ? <p className="text-xs text-[var(--color-stress)]">{error}</p> : null}
      </Card>

      {profile ? (
        <FoodDetailPanel
          profile={profile}
          date={date}
          onDone={() => setProfile(null)}
          onCancel={() => setProfile(null)}
        />
      ) : null}
    </div>
  );
}

declare global {
  interface Window {
    BarcodeDetector: new (options?: { formats: string[] }) => {
      detect: (source: ImageBitmapSource) => Promise<{ rawValue: string }[]>;
    };
  }
}
