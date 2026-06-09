import { NextResponse, type NextRequest } from "next/server";
import { getFood } from "@/lib/usda";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const fdcId = Number(request.nextUrl.searchParams.get("fdcId"));
  if (!Number.isFinite(fdcId) || fdcId <= 0) {
    return NextResponse.json({ error: "Invalid fdcId" }, { status: 400 });
  }

  try {
    const profile = await getFood(fdcId);
    return NextResponse.json({ profile });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 502 },
    );
  }
}
