import { NextResponse, type NextRequest } from "next/server";
import { isMuseAuthorized, museUnauthorized } from "@/lib/muse/auth";
import { getTimezone } from "@/lib/data/oura";
import {
  addMidRunIntake,
  deleteMidRunIntake,
  fuelRunRefForDate,
  getFuelProducts,
  getMidRunIntakesForDate,
  matchFuelProduct,
} from "@/lib/data/running";
import { GEL_DEFAULT } from "@/lib/run-fuel";
import { normalizeIsoDate, todayInTimezone } from "@/lib/utils";
import type { FuelProduct, MidRunIntake } from "@/types";

export const dynamic = "force-dynamic";

const MAX_COUNT = 10;
/** What identifies the fuel itself — a saved product, or explicit numbers. */
type FuelFields = Omit<
  Parameters<typeof addMidRunIntake>[0],
  "date" | "planned_run_id" | "actual_run_id" | "taken_at_min"
>;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function bad(error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...extra }, { status: 400 });
}

const productView = (p: FuelProduct) => ({
  name: p.name,
  carbs_g: p.carbs_g,
  kcal: p.kcal,
  caffeine_mg: p.caffeine_mg,
});

const intakeView = (i: MidRunIntake) => ({
  id: i.id,
  label: i.label,
  carbs_g: i.carbs_g,
  kcal: i.kcal,
  caffeine_mg: i.caffeine_mg,
  taken_at_min: i.taken_at_min,
});

async function resolveDate(raw: unknown): Promise<string | null> {
  const today = todayInTimezone(await getTimezone());
  const date = raw == null ? today : normalizeIsoDate(raw);
  return date && date <= today ? date : null;
}

/** Parker's saved fuel products + what's logged against a day's run (`?date=`, default today). */
export async function GET(request: NextRequest) {
  if (!isMuseAuthorized(request)) return museUnauthorized();
  const date = await resolveDate(request.nextUrl.searchParams.get("date"));
  if (!date) return bad("date must be YYYY-MM-DD and not in the future");
  try {
    const [products, ref, logged] = await Promise.all([
      getFuelProducts(),
      fuelRunRefForDate(date),
      getMidRunIntakesForDate(date),
    ]);
    return NextResponse.json({
      date,
      has_run: ref != null,
      products: products.map(productView),
      logged: logged.map(intakeView),
    });
  } catch (err) {
    console.error("[muse] run fuel read", err);
    return NextResponse.json({ error: "Failed to read run fuel" }, { status: 500 });
  }
}

/**
 * Log gels / chews against the day's run. `product` names one of Parker's
 * saved fuels (its carbs, calories and caffeine are used); otherwise pass
 * `carbs_g` (+ optional `kcal`, `caffeine_mg`, `label`).
 */
export async function POST(request: NextRequest) {
  if (!isMuseAuthorized(request)) return museUnauthorized();
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return bad("Body must be JSON");
  }

  const date = await resolveDate(body.date);
  if (!date) return bad("date must be YYYY-MM-DD and not in the future");
  const count = body.count == null ? 1 : num(body.count);
  if (count == null || !Number.isInteger(count) || count < 1 || count > MAX_COUNT) {
    return bad(`count must be a whole number from 1 to ${MAX_COUNT}`);
  }
  const takenAt = body.taken_at_min == null ? null : num(body.taken_at_min);
  if (body.taken_at_min != null && (takenAt == null || takenAt < 0)) {
    return bad("taken_at_min must be minutes ≥ 0");
  }

  try {
    const [ref, products] = await Promise.all([fuelRunRefForDate(date), getFuelProducts()]);
    if (!ref) {
      return NextResponse.json(
        {
          error:
            "No run or ride on that day to attach fuel to. Log the run first (POST /api/muse/runs), then log the fuel.",
        },
        { status: 409 },
      );
    }

    let fuel: FuelFields;
    const carbs = num(body.carbs_g);

    if (typeof body.product === "string" && body.product.trim()) {
      const { product, candidates } = matchFuelProduct(products, body.product);
      if (product) {
        fuel = { product_id: product.id };
      } else if (carbs != null) {
        // Not a saved product, but the numbers were given — log it as named.
        fuel = {
          label: body.product,
          carbs_g: carbs,
          kcal: num(body.kcal) ?? undefined,
          caffeine_mg: num(body.caffeine_mg),
        };
      } else {
        return NextResponse.json(
          {
            error:
              candidates.length > 1
                ? `"${body.product}" matches several saved fuels — ask Parker which one.`
                : `No saved fuel named "${body.product}". Ask Parker for its carbs (and caffeine) and send carbs_g, or pick one of his products.`,
            products: (candidates.length > 1 ? candidates : products).map(productView),
          },
          { status: 404 },
        );
      }
    } else if (carbs != null) {
      if (carbs < 0) return bad("carbs_g must be ≥ 0");
      fuel = {
        label: typeof body.label === "string" ? body.label : undefined,
        carbs_g: carbs,
        kcal: num(body.kcal) ?? undefined,
        caffeine_mg: num(body.caffeine_mg),
      };
    } else if (products.length === 0) {
      fuel = { label: GEL_DEFAULT.label, carbs_g: GEL_DEFAULT.carbs_g, kcal: GEL_DEFAULT.kcal };
    } else if (products.length === 1) {
      fuel = { product_id: products[0]!.id };
    } else {
      return bad("Which fuel? Parker has several saved — send `product` with one of these names.", {
        products: products.map(productView),
      });
    }

    const logged: MidRunIntake[] = [];
    for (let i = 0; i < count; i++) {
      logged.push(await addMidRunIntake({ date, ...ref, ...fuel, taken_at_min: takenAt }));
    }
    const day = await getMidRunIntakesForDate(date);
    return NextResponse.json({
      logged: logged.map(intakeView),
      day_total: {
        items: day.length,
        carbs_g: Math.round(day.reduce((s, i) => s + i.carbs_g, 0)),
        kcal: Math.round(day.reduce((s, i) => s + i.kcal, 0)),
        caffeine_mg: Math.round(day.reduce((s, i) => s + (i.caffeine_mg ?? 0), 0)),
      },
    });
  } catch (err) {
    console.error("[muse] log run fuel", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to log fuel" },
      { status: 500 },
    );
  }
}

/** Undo a mistaken fuel log (`?id=` from `logged`). */
export async function DELETE(request: NextRequest) {
  if (!isMuseAuthorized(request)) return museUnauthorized();
  const id = request.nextUrl.searchParams.get("id");
  if (!id || !UUID_RE.test(id)) return bad("id must be a fuel log id from `logged`");
  try {
    await deleteMidRunIntake(id);
    return NextResponse.json({ deleted: id });
  } catch (err) {
    console.error("[muse] delete run fuel", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete fuel" },
      { status: 500 },
    );
  }
}
