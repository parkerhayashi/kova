import type { Metadata } from "next";
import { MfaSetup } from "@/components/settings/MfaSetup";
import { isMfaEnabled } from "@/lib/data/auth";

export const metadata: Metadata = {
  title: "Kova — Security",
};

export const dynamic = "force-dynamic";

export default async function SecuritySettingsPage() {
  const mfaEnabled = await isMfaEnabled();

  return (
    <div className="space-y-6">
      <div>
        <div className="metric-label mb-1">Settings</div>
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
          Security
        </h1>
      </div>

      <MfaSetup enabled={mfaEnabled} />
    </div>
  );
}
