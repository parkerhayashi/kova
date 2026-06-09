export interface ScatterPoint {
  label: string;
  x: number;
  y: number;
}

/** Pearson correlation coefficient for paired numeric samples. */
export function pearsonR(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 3 || ys.length !== n) return null;

  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  const den = Math.sqrt(denX * denY);
  if (den === 0) return null;
  return Math.round((num / den) * 100) / 100;
}

export function scatterFromPairs(
  pairs: { label: string; x: number; y: number }[],
): { points: ScatterPoint[]; r: number | null } {
  const points = pairs.map((p) => ({ label: p.label, x: p.x, y: p.y }));
  const r = pearsonR(
    points.map((p) => p.x),
    points.map((p) => p.y),
  );
  return { points, r };
}

/** Human-readable strength label for |r|. */
export function describeCorrelation(r: number | null): string {
  if (r === null) return "Not enough data";
  const a = Math.abs(r);
  if (a >= 0.7) return "Strong";
  if (a >= 0.4) return "Moderate";
  if (a >= 0.2) return "Weak";
  return "None";
}

export function formatR(r: number | null): string {
  if (r === null) return "—";
  const sign = r > 0 ? "+" : "";
  return `${sign}${r.toFixed(2)}`;
}
