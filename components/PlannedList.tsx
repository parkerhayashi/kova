import { Card } from "@/components/ui/Card";

/**
 * PlannedList — temporary scaffold that surfaces a view's planned content
 * (blueprint §7) until the feature is built in its phase. Each item becomes a
 * real component/chart as the corresponding phase lands.
 */
export function PlannedList({
  phase,
  items,
}: {
  phase: string;
  items: string[];
}) {
  return (
    <Card className="space-y-3">
      <span className="metric-label">Planned · {phase}</span>
      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={item}
            className="body-copy flex items-center gap-2 text-sm"
          >
            <span className="bg-border inline-block size-1.5 rounded-full" />
            {item}
          </li>
        ))}
      </ul>
    </Card>
  );
}
