import { NextResponse } from "next/server";
import { analyzeMealCapture, isCaptureConfigured } from "@/lib/nutrition-capture";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!isCaptureConfigured()) {
    return NextResponse.json(
      { error: "Meal capture is not configured (ANTHROPIC_API_KEY missing)" },
      { status: 503 },
    );
  }

  let body: { image?: string; mediaType?: string; description?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const image = body.image?.trim();
  if (!image) {
    return NextResponse.json({ error: "image is required" }, { status: 400 });
  }

  const base64 = image.includes(",") ? image.split(",")[1]! : image;

  try {
    const result = await analyzeMealCapture({
      imageBase64: base64,
      mediaType: body.mediaType ?? "image/jpeg",
      description: body.description,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Capture failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
