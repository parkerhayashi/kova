import type { Metadata } from "next";
import { KovaWordmark } from "@/components/brand/KovaWordmark";
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
  let mfaRequired = false;
  try {
    mfaRequired = await isMfaEnabled();
  } catch {
    mfaRequired = false;
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="metric-label">Personal Health OS</div>
          <KovaWordmark height={36} />
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
              className="field-input h-11"
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
                className="field-input h-11 font-mono"
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

          <button type="submit" className="btn-primary h-11 w-full text-sm">
            Unlock
          </button>
        </form>
      </div>
    </main>
  );
}
