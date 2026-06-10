"use server";

import { revalidatePath } from "next/cache";
import { saveUserProfile, type ProfilePatch } from "@/lib/data/profile";

export async function updateProfile(patch: ProfilePatch): Promise<void> {
  await saveUserProfile(patch);
  revalidatePath("/settings/profile");
  revalidatePath("/nutrition");
  revalidatePath("/");
  revalidatePath("/water");
}
