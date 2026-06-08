/**
 * Hevy API integration (blueprint §2) — strength workouts.
 * Auth: static API key in the `api-key` header.
 * Risk note (§12): Hevy's API is relatively new — validate workout history
 * endpoint coverage before building the workouts view. Fallback: CSV export.
 */

const HEVY_BASE = "https://api.hevyapp.com/v1";

function headers() {
  return {
    "api-key": process.env.HEVY_API_KEY!,
    Accept: "application/json",
  };
}

export interface HevyWorkout {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  exercises: {
    title: string;
    sets: { reps: number | null; weight_kg: number | null }[];
  }[];
}

/** Page through workout history. Hevy paginates 1-indexed. */
export async function getWorkouts(
  page = 1,
  pageSize = 10,
): Promise<{ workouts: HevyWorkout[]; page_count: number }> {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  const res = await fetch(`${HEVY_BASE}/workouts?${params}`, {
    headers: headers(),
  });
  if (!res.ok) throw new Error(`Hevy workouts failed: ${res.status}`);
  return res.json();
}
