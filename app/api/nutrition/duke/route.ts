import { NextResponse, type NextRequest } from "next/server";
import {
  dukeItemToProfile,
  getDukeItem,
  loadDukeCatalog,
  searchDukeCatalog,
} from "@/lib/duke-dining";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const id = sp.get("id")?.trim();
  const q = sp.get("q")?.trim();
  const location = sp.get("location")?.trim() || undefined;

  try {
    if (id) {
      const item = getDukeItem(id);
      if (!item) {
        return NextResponse.json({ error: "Item not found" }, { status: 404 });
      }
      return NextResponse.json({ item, profile: dukeItemToProfile(item) });
    }

    if (q && q.length >= 2) {
      const items = searchDukeCatalog(q, location);
      return NextResponse.json({ items });
    }

    const catalog = loadDukeCatalog();
    return NextResponse.json({
      syncedAt: catalog.syncedAt,
      locations: catalog.locations,
    });
  } catch (err) {
    const message = (err as Error).message;
    const missing = message.includes("ENOENT");
    return NextResponse.json(
      {
        error: missing
          ? "Duke dining catalog not built — run npm run duke:sync"
          : message,
      },
      { status: missing ? 503 : 502 },
    );
  }
}
