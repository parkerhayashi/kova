import type { Metadata } from "next";
import { isMfaEnabled } from "@/lib/data/auth";

export const metadata: Metadata = {
  title: "Kova — Unlock",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : "/";
  const wrongPassword = sp.error === "1";
  const rateLimited = sp.error === "2";
  const wrongTotp = sp.error === "3";
  const mfaRequired = await isMfaEnabled();

  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="metric-label mb-2">Personal Health OS</div>
          <h1 className="text-3xl font-semibold tracking-tight text-text-primary">
            Kova
          </h1>
        </div>

        <form
          action="/api/login"
          method="post"
          className="card flex flex-col gap-4 p-6"
        >
          <input type="hidden" name="next" value={next} />

          <label className="flex flex-col gap-2">
            <span className="metric-label">Password</span>
            <input
              type="password"
              name="password"
              autoFocus={!mfaRequired}
              required
              autoComplete="current-password"
              className="h-11 rounded-lg border border-border bg-surface-raised px-3 text-text-primary outline-none transition-colors focus:border-border-strong"
            />
          </label>

          {mfaRequired ? (
            <label className="flex flex-col gap-2">
              <span className="metric-label">Authenticator code</span>
              <input
                type="text"
                name="totp"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                required
                autoFocus
                className="h-11 rounded-lg border border-border bg-surface-raised px-3 font-mono text-text-primary outline-none transition-colors focus:border-border-strong"
              />
            </label>
          ) : null}

          {wrongPassword ? (
            <p className="text-sm text-[var(--color-stress)]">
              Incorrect password. Try again.
            </p>
          ) : null}

          {wrongTotp ? (
            <p className="text-sm text-[var(--color-stress)]">
              Invalid authenticator code. Try again.
            </p>
          ) : null}

          {rateLimited ? (
            <p className="text-sm text-[var(--color-stress)]">
              Too many attempts. Wait 15 minutes and try again.
            </p>
          ) : null}

          <button
            type="submit"
            className="h-11 rounded-lg bg-text-primary font-medium text-background transition-opacity hover:opacity-90"
          >
            Unlock
          </button>
        </form>
      </div>
    </main>
  );
}
