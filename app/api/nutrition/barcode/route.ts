import { NextResponse, type NextRequest } from "next/server";
import { getByBarcode } from "@/lib/openfoodfacts";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")?.trim();
  if (!code || code.length < 4) {
    return NextResponse.json({ error: "Invalid barcode" }, { status: 400 });
  }

  try {
    const profile = await getByBarcode(code);
    if (!profile) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    return NextResponse.json({ profile });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 502 },
    );
  }
}
