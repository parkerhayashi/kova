"use client";

import { useRef, useState } from "react";
import { Camera, ImagePlus, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { MealCaptureReview } from "@/components/nutrition/MealCaptureReview";
import { compressMealImage } from "@/lib/nutrition-capture-client";
import type { CaptureAnalysisResult, CaptureItem } from "@/types";

type Step = "capture" | "analyzing" | "review" | "refining";

export function MealCaptureFlow({
  date,
  onClose,
}: {
  date: string;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>("capture");
  const [description, setDescription] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imagePayload, setImagePayload] = useState<{
    base64: string;
    mediaType: string;
  } | null>(null);
  const [mealName, setMealName] = useState("");
  const [items, setItems] = useState<CaptureItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | null) {
    if (!file) return;
    setError(null);

    try {
      const compressed = await compressMealImage(file);
      setImagePayload(compressed);
      setPreviewUrl(URL.createObjectURL(file));
    } catch {
      setError("Could not read that image. Try another photo.");
    }
  }

  async function analyze() {
    if (!imagePayload) {
      setError("Add a photo first.");
      return;
    }

    setStep("analyzing");
    setError(null);

    try {
      const res = await fetch("/api/nutrition/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: imagePayload.base64,
          mediaType: imagePayload.mediaType,
          description,
        }),
      });
      const json = (await res.json()) as CaptureAnalysisResult & { error?: string };
      if (!res.ok) {
        throw new Error(json.error ?? "Analysis failed");
      }
      setMealName(json.meal_name ?? "");
      setItems(json.items);
      setStep("review");
    } catch (err) {
      setStep("capture");
      setError(err instanceof Error ? err.message : "Analysis failed");
    }
  }

  async function refine(fixDescription: string) {
    setStep("refining");
    setError(null);

    try {
      const res = await fetch("/api/nutrition/capture/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, fixDescription }),
      });
      const json = (await res.json()) as CaptureAnalysisResult & { error?: string };
      if (!res.ok) {
        throw new Error(json.error ?? "Could not apply fix");
      }
      if (json.meal_name) setMealName(json.meal_name);
      setItems(json.items);
      setStep("review");
    } catch (err) {
      setStep("review");
      setError(err instanceof Error ? err.message : "Could not apply fix");
    }
  }

  function resetCapture() {
    setStep("capture");
    setPreviewUrl(null);
    setImagePayload(null);
    setItems([]);
    setMealName("");
    setError(null);
  }

  const busy = step === "analyzing" || step === "refining";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <header className="border-border flex shrink-0 items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="text-text-muted size-4" />
          <h2 className="text-text-primary text-sm font-semibold">Capture meal</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-text-muted hover:text-text-primary p-1"
        >
          <X className="size-5" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {step === "capture" || step === "analyzing" ? (
          <div className="mx-auto max-w-md space-y-4">
            <Card className="space-y-3 overflow-hidden p-0">
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl}
                  alt="Meal preview"
                  className="aspect-[4/3] w-full object-cover"
                />
              ) : (
                <div className="border-border flex aspect-[4/3] flex-col items-center justify-center gap-2 border-b border-dashed bg-[rgba(255,255,255,0.02)]">
                  <Camera className="text-text-muted size-8" />
                  <p className="text-text-muted text-sm">Photo your plate</p>
                </div>
              )}

              <div className="space-y-3 p-3">
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional: describe the meal (helps identify ingredients)"
                  rows={3}
                  className="border-border-strong bg-surface w-full resize-none rounded-lg border px-3 py-2 text-sm"
                />

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => cameraRef.current?.click()}
                    disabled={busy}
                  >
                    <Camera className="size-4" />
                    Camera
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => fileRef.current?.click()}
                    disabled={busy}
                  >
                    <ImagePlus className="size-4" />
                    Gallery
                  </Button>
                </div>

                <input
                  ref={cameraRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
                />
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
                />

                <Button
                  type="button"
                  variant="primary"
                  className="w-full"
                  disabled={!imagePayload || busy}
                  onClick={() => void analyze()}
                >
                  {busy ? "Analyzing…" : "Analyze meal"}
                </Button>
              </div>
            </Card>

            {busy ? (
              <p className="text-text-muted text-center text-sm">
                Identifying foods and estimating nutrition…
              </p>
            ) : null}
          </div>
        ) : (
          <div className="mx-auto max-w-md">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="Meal"
                className="border-border mb-4 aspect-[3/1] w-full rounded-xl border object-cover"
              />
            ) : null}
            <MealCaptureReview
              date={date}
              mealName={mealName}
              items={items}
              busy={busy}
              onMealNameChange={setMealName}
              onItemsChange={setItems}
              onRefine={(text) => void refine(text)}
              onBack={resetCapture}
              onDone={onClose}
            />
          </div>
        )}

        {error ? (
          <p className="text-center text-xs text-[var(--color-stress)] mt-4">{error}</p>
        ) : null}
      </div>
    </div>
  );
}
