import Link from "next/link";
import { getHomeTrends } from "@/lib/data/health-snapshot";
import { formatR } from "@/lib/trends/correlation";

/** Top 30-day correlations — its own Suspense boundary so it never holds up Home. */
export async function HomeTrends() {
  const trends = await getHomeTrends();
  if (trends.length === 0) return null;
  return (
    <section className="section">
      <Link href="/trends" className="snapshot-link-card">
        <div className="dash-card snapshot-trends">
          <span className="metric-label">Trends · 30 days</span>
          <ul className="snapshot-trend-list">
            {trends.map((t) => (
              <li key={t.id} className="snapshot-trend-row">
                <span className="snapshot-trend-title">{t.title}</span>
                <span className="snapshot-trend-r">
                  {formatR(t.r)}{" "}
                  <span className="snapshot-trend-strength">({t.strength})</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </Link>
    </section>
  );
}
