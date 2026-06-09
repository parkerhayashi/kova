import type { Metadata } from "next";

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
  const error = sp.error === "1";

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
              autoFocus
              required
              autoComplete="current-password"
              className="h-11 rounded-lg border border-border bg-surface-raised px-3 text-text-primary outline-none transition-colors focus:border-border-strong"
            />
          </label>

          {error ? (
            <p className="text-sm text-[var(--color-stress)]">
              Incorrect password. Try again.
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
