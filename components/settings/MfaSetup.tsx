"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  enabled: boolean;
};

export function MfaSetup({ enabled: initialEnabled }: Props) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [phase, setPhase] = useState<"idle" | "setup" | "disable">("idle");
  const [secret, setSecret] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function startSetup() {
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/mfa/setup", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Setup failed");
      setSecret(data.secret);
      setQrDataUrl(data.qrDataUrl);
      setPhase("setup");
      setCode("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Setup failed");
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnable(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/mfa/enable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret, code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Invalid code");
      setEnabled(true);
      setPhase("idle");
      setSecret("");
      setQrDataUrl("");
      setCode("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid code");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDisable(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/mfa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not disable MFA");
      setEnabled(false);
      setPhase("idle");
      setPassword("");
      setCode("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not disable MFA");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-6">
      <div className="mb-4">
        <h2 className="text-lg font-medium text-text-primary">
          Two-factor authentication
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          Require a 6-digit code from your authenticator app at login.
        </p>
      </div>

      <div className="mb-4 flex items-center gap-2 text-sm">
        <span
          className={`size-2 rounded-full ${enabled ? "bg-[var(--color-recovery)]" : "bg-text-muted"}`}
        />
        <span className="text-text-secondary">
          {enabled ? "Enabled" : "Not enabled"}
        </span>
      </div>

      {error ? (
        <p className="mb-4 text-sm text-[var(--color-stress)]">{error}</p>
      ) : null}

      {phase === "idle" && !enabled ? (
        <button
          type="button"
          onClick={startSetup}
          disabled={busy}
          className="h-10 rounded-lg bg-text-primary px-4 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Preparing…" : "Enable MFA"}
        </button>
      ) : null}

      {phase === "setup" ? (
        <form onSubmit={confirmEnable} className="flex flex-col gap-4">
          <p className="text-sm text-text-secondary">
            Scan this QR code in 1Password, Google Authenticator, or any TOTP
            app. Then enter the 6-digit code to confirm.
          </p>
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrDataUrl}
              alt="TOTP QR code"
              className="mx-auto rounded-lg border border-border"
              width={220}
              height={220}
            />
          ) : null}
          {secret ? (
            <p className="break-all font-mono text-xs text-text-muted">
              Manual key: {secret}
            </p>
          ) : null}
          <label className="flex flex-col gap-2">
            <span className="metric-label">Verification code</span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="h-11 rounded-lg border border-border bg-surface-raised px-3 font-mono text-text-primary outline-none transition-colors focus:border-border-strong"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy || code.length !== 6}
              className="h-10 rounded-lg bg-text-primary px-4 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Confirming…" : "Confirm & enable"}
            </button>
            <button
              type="button"
              onClick={() => {
                setPhase("idle");
                setSecret("");
                setQrDataUrl("");
                setCode("");
                setError("");
              }}
              className="h-10 rounded-lg border border-border px-4 text-sm text-text-secondary transition-colors hover:text-text-primary"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {phase === "idle" && enabled ? (
        <button
          type="button"
          onClick={() => {
            setPhase("disable");
            setError("");
            setPassword("");
            setCode("");
          }}
          className="h-10 rounded-lg border border-border px-4 text-sm text-text-secondary transition-colors hover:text-text-primary"
        >
          Disable MFA
        </button>
      ) : null}

      {phase === "disable" ? (
        <form onSubmit={confirmDisable} className="flex flex-col gap-4">
          <p className="text-sm text-text-secondary">
            Enter your password and a current authenticator code to turn off MFA.
          </p>
          <label className="flex flex-col gap-2">
            <span className="metric-label">Password</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 rounded-lg border border-border bg-surface-raised px-3 text-text-primary outline-none transition-colors focus:border-border-strong"
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="metric-label">Authenticator code</span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="h-11 rounded-lg border border-border bg-surface-raised px-3 font-mono text-text-primary outline-none transition-colors focus:border-border-strong"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy || code.length !== 6}
              className="h-10 rounded-lg bg-text-primary px-4 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Disabling…" : "Disable MFA"}
            </button>
            <button
              type="button"
              onClick={() => {
                setPhase("idle");
                setPassword("");
                setCode("");
                setError("");
              }}
              className="h-10 rounded-lg border border-border px-4 text-sm text-text-secondary transition-colors hover:text-text-primary"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
