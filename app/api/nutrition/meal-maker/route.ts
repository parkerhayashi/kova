import { NextResponse } from "next/server";
import { getSavedMeals } from "@/lib/data/saved-meals";
import {
  generateMealMakerProposal,
  isMealMakerConfigured,
  listMealMakerPlaces,
  mealMakerConfigError,
  type MealMakerPlaceKind,
  type MealMakerTargets,
} from "@/lib/meal-maker";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const configError = mealMakerConfigError();
  return NextResponse.json({
    configured: isMealMakerConfigured(),
    error: configError,
    places: listMealMakerPlaces(),
  });
}

export async function POST(request: Request) {
  const configError = mealMakerConfigError();
  if (configError) {
    return NextResponse.json({ error: configError }, { status: 503 });
  }

  let body: {
    kind?: string;
    placeId?: string;
    targets?: MealMakerTargets;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const kind = body.kind === "duke" || body.kind === "restaurant" ? body.kind : null;
  const placeId = typeof body.placeId === "string" ? body.placeId.trim() : "";
  if (!kind || !placeId) {
    return NextResponse.json(
      { error: "kind and placeId are required" },
      { status: 400 },
    );
  }

  const targets: MealMakerTargets = {
    calories: numOrNull(body.targets?.calories),
    protein_g: numOrNull(body.targets?.protein_g),
    carbs_g: numOrNull(body.targets?.carbs_g),
    fat_g: numOrNull(body.targets?.fat_g),
    notes:
      typeof body.targets?.notes === "string" ? body.targets.notes : null,
  };

  try {
    const savedMeals = await getSavedMeals();
    const proposal = await generateMealMakerProposal({
      kind: kind as MealMakerPlaceKind,
      placeId,
      targets,
      savedMeals,
    });
    return NextResponse.json(proposal);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Meal maker failed";
    const status = /not configured|invalid|rejected|Unknown/i.test(message)
      ? 503
      : 502;
    return NextResponse.json({ error: message }, { status });
  }
}

function numOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}
