import { FinanceLinked } from "@/components/finances/FinanceLinked";
import { Finances } from "@/components/finances/Finances";

export default function FinancesPage() {
  return (
    <div className="space-y-2">
      <FinanceLinked />
      <Finances />
    </div>
  );
}
