/** Fired after client-side changes that affect the top bar's quick stats. */
export const TOP_BAR_REFRESH_EVENT = "kova-topbar-refresh";

/** Ask the TopBar to refetch /api/today/summary (client-only, no-op on server). */
export function notifyTopBar(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(TOP_BAR_REFRESH_EVENT));
}
