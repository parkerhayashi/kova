import dynamic from "next/dynamic";
import { ChartSkeleton } from "./ChartSkeleton";

export const LazyIntradayChart = dynamic(
  () =>
    import("./IntradayChart").then((m) => ({ default: m.IntradayChart })),
  { loading: () => <ChartSkeleton height={160} /> },
);

export const LazyScatterChart = dynamic(
  () =>
    import("./ScatterChart").then((m) => ({ default: m.ScatterChart })),
  { loading: () => <ChartSkeleton height={200} /> },
);

export const LazyDualTrendChart = dynamic(
  () =>
    import("./DualTrendChart").then((m) => ({ default: m.DualTrendChart })),
  { loading: () => <ChartSkeleton height={180} /> },
);

export const LazyTrendChart = dynamic(
  () => import("./TrendChart").then((m) => ({ default: m.TrendChart })),
  { loading: () => <ChartSkeleton /> },
);

export const LazyFitnessChart = dynamic(
  () => import("./FitnessChart").then((m) => ({ default: m.FitnessChart })),
  { loading: () => <ChartSkeleton height={220} /> },
);

export const LazyStackedWeeks = dynamic(
  () => import("./FitnessChart").then((m) => ({ default: m.StackedWeeks })),
  { loading: () => <ChartSkeleton height={180} /> },
);
