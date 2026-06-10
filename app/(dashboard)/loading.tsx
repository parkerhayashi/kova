/** Instant feedback while a dashboard route's server data loads. */
export default function DashboardLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading page">
      <div className="space-y-2">
        <div className="h-7 w-40 animate-pulse rounded-md bg-[rgba(255,255,255,0.06)]" />
        <div className="h-4 w-64 animate-pulse rounded-md bg-[rgba(255,255,255,0.04)]" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="card h-[88px] animate-pulse bg-[rgba(255,255,255,0.02)]"
          />
        ))}
      </div>
      <div className="card h-52 animate-pulse bg-[rgba(255,255,255,0.02)]" />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="card h-44 animate-pulse bg-[rgba(255,255,255,0.02)]" />
        <div className="card h-44 animate-pulse bg-[rgba(255,255,255,0.02)]" />
      </div>
    </div>
  );
}
