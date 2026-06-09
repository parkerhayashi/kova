"use client";

import { useEffect } from "react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard]", error);
  }, [error]);

  return (
    <div className="card mx-auto max-w-md p-6 text-center">
      <h1 className="text-lg font-medium text-text-primary">
        Something went wrong
      </h1>
      <p className="mt-2 text-sm text-text-secondary">
        The dashboard failed to load. This is often fixed by a hard refresh or
        clearing cached site data after an update.
      </p>
      <div className="mt-4 flex flex-col gap-2">
        <button
          type="button"
          onClick={() => reset()}
          className="h-10 rounded-lg bg-text-primary text-sm font-medium text-background"
        >
          Try again
        </button>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="h-10 rounded-lg border border-border text-sm text-text-secondary"
        >
          Hard refresh
        </button>
      </div>
    </div>
  );
}
