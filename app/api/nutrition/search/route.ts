import { NextResponse, type NextRequest } from "next/server";
import { searchProducts } from "@/lib/openfoodfacts";
import { searchFoods } from "@/lib/usda";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ foods: [], off: [] });
  }

  const [usdaResult, offResult] = await Promise.allSettled([
    searchFoods(q),
    searchProducts(q),
  ]);

  if (usdaResult.status === "rejected" && offResult.status === "rejected") {
    return NextResponse.json(
      { error: usdaResult.reason?.message ?? "Search failed" },
      { status: 502 },
    );
  }

  const foods =
    usdaResult.status === "fulfilled"
      ? usdaResult.value.map((f) => ({
          fdcId: f.fdcId,
          name: f.description,
          brand: f.brandName ?? null,
          dataType: f.dataType ?? null,
          servingSize: f.servingSize ?? null,
          servingUnit: f.servingSizeUnit ?? null,
        }))
      : [];

  const off = offResult.status === "fulfilled" ? offResult.value : [];

  return NextResponse.json({ foods, off });
}
