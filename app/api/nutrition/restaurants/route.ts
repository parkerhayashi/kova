import { NextResponse, type NextRequest } from "next/server";
import {
  getRestaurantItem,
  loadRestaurantCatalog,
  restaurantItemToProfile,
  searchRestaurantCatalog,
} from "@/lib/restaurants";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const id = sp.get("id")?.trim();
  const q = sp.get("q")?.trim();
  const restaurant = sp.get("restaurant")?.trim() || undefined;

  try {
    if (id) {
      const item = getRestaurantItem(id);
      if (!item) {
        return NextResponse.json({ error: "Item not found" }, { status: 404 });
      }
      return NextResponse.json({ item, profile: restaurantItemToProfile(item) });
    }

    if (q && q.length >= 2) {
      const items = searchRestaurantCatalog(q, restaurant);
      return NextResponse.json({ items });
    }

    const catalog = loadRestaurantCatalog();
    return NextResponse.json({
      syncedAt: catalog.syncedAt,
      restaurants: catalog.restaurants,
    });
  } catch (err) {
    const message = (err as Error).message;
    const missing = message.includes("ENOENT");
    return NextResponse.json(
      {
        error: missing
          ? "Restaurant catalog not built — add chain JSON files and run npm run restaurants:sync"
          : message,
      },
      { status: missing ? 503 : 502 },
    );
  }
}
