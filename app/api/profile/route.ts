import { NextResponse } from "next/server";
import { getUserProfile, saveUserProfile, type ProfilePatch } from "@/lib/data/profile";

export async function GET() {
  const profile = await getUserProfile();
  return NextResponse.json({ profile });
}

export async function PATCH(req: Request) {
  const body = (await req.json()) as ProfilePatch;
  await saveUserProfile({
    age: body.age ?? null,
    height_m: body.height_m ?? null,
    biological_sex: body.biological_sex ?? null,
    activity_level: body.activity_level ?? null,
  });
  const profile = await getUserProfile();
  return NextResponse.json({ profile });
}
