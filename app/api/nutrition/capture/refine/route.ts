import { NextResponse } from "next/server";
import { captureConfigError, refineMealCapture } from "@/lib/nutrition-capture";
import type { CaptureItem } from "@/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const configError = captureConfigError();
  if (configError) {
    return NextResponse.json({ error: configError }, { status: 503 });
  }

  let body: { items?: CaptureItem[]; fixDescription?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const fixDescription = body.fixDescription?.trim();
  if (!fixDescription) {
    return NextResponse.json({ error: "fixDescription is required" }, { status: 400 });
  }
  if (!body.items?.length) {
    return NextResponse.json({ error: "items is required" }, { status: 400 });
  }

  try {
    const result = await refineMealCapture({
      items: body.items,
      fixDescription,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Refine failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
