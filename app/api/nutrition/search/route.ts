import { NextResponse, type NextRequest } from "next/server";
import { searchFoods } from "@/lib/usda";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ foods: [] });
  }

  try {
    const foods = await searchFoods(q);
    return NextResponse.json({
      foods: foods.map((f) => ({
        fdcId: f.fdcId,
        name: f.description,
        brand: f.brandName ?? null,
        servingSize: f.servingSize ?? null,
        servingUnit: f.servingSizeUnit ?? null,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 502 },
    );
  }
}
