import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { getWaterState, saveWaterState } from "@/lib/data/water";
import { normalizeWater, type WaterState } from "@/lib/water";

export const dynamic = "force-dynamic";

export async function GET() {
  const state = await getWaterState();
  return NextResponse.json({ state });
}

export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const state = normalizeWater(body as Partial<WaterState>);
  await saveWaterState(state);
  revalidatePath("/settings/profile");
  revalidatePath("/water");
  revalidatePath("/today");
  revalidatePath("/nutrition");
  return NextResponse.json({ ok: true });
}
