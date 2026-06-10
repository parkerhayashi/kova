interface ChartSkeletonProps {
  height?: number;
}

/** Placeholder while Recharts bundles load — keeps layout stable. */
export function ChartSkeleton({ height = 180 }: ChartSkeletonProps) {
  return (
    <div
      className="animate-pulse rounded-lg bg-[rgba(255,255,255,0.04)]"
      style={{ height }}
      aria-hidden
    />
  );
}
