"use client";

import { useCallback, useEffect, useState } from "react";
import { usePlaidLink, type PlaidLinkOnSuccessMetadata } from "react-plaid-link";
import { Building2, Link2, RefreshCw, Unlink } from "lucide-react";

interface Overview {
  connected: boolean;
  plaid_configured?: boolean;
  institutions: { id: string; name: string; last_synced_at: string | null }[];
  accounts: {
    id: string;
    name: string;
    type: string | null;
    subtype: string | null;
    mask: string | null;
    current_balance: number | null;
    institution_name: string | null;
  }[];
  summary: { month: string; spending: number; income: number; net: number };
  transactions: {
    id: string;
    date: string;
    name: string | null;
    merchant_name: string | null;
    amount: number;
    pending: boolean;
    category_primary: string | null;
  }[];
  error?: string;
}

function fmtUsd(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
}

function fmtDate(iso: string) {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Plaid-linked bank accounts panel — sits above the manual finances tracker.
 * Connect via Plaid Link, sync transactions to Supabase, show cashflow + feed.
 */
export function FinanceLinked() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    try {
      const res = await fetch("/api/finance/overview");
      const data = (await res.json()) as Overview;
      if (!res.ok) throw new Error(data.error ?? "Failed to load finance data.");
      setOverview(data);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshLinkToken = useCallback(async () => {
    try {
      const res = await fetch("/api/plaid/link-token", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setLinkToken(data.link_token);
    } catch {
      /* Plaid not configured yet — connect button stays disabled */
    }
  }, []);

  useEffect(() => {
    void loadOverview();
    void refreshLinkToken();
  }, [loadOverview, refreshLinkToken]);

  const onSuccess = useCallback(
    async (public_token: string, metadata: PlaidLinkOnSuccessMetadata) => {
      setConnecting(true);
      setError(null);
      try {
        const res = await fetch("/api/plaid/exchange", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            public_token,
            institution_name: metadata.institution?.name ?? null,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Link failed.");
        await loadOverview();
        await refreshLinkToken();
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setConnecting(false);
      }
    },
    [loadOverview, refreshLinkToken],
  );

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
  });

  async function manualSync() {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch("/api/plaid/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sync failed.");
      await loadOverview();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSyncing(false);
    }
  }

  async function disconnect(id: string, name: string) {
    if (!confirm(`Disconnect ${name}? Transactions stay in Kova until you delete them.`)) return;
    try {
      const res = await fetch(`/api/plaid/item?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Disconnect failed.");
      await loadOverview();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const configured = overview?.plaid_configured !== false;
  const connected = overview?.connected ?? false;
  const monthLabel = overview?.summary.month
    ? new Date(overview.summary.month + "-01T12:00:00").toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      })
    : "This month";

  return (
    <section className="mb-8 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="metric-label mb-1">Linked accounts</p>
          <h2 className="section-title text-lg">Bank &amp; cards</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {connected ? (
            <button
              type="button"
              onClick={() => manualSync()}
              disabled={syncing}
              className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-surface-raised hover:text-text-primary disabled:opacity-50"
            >
              <RefreshCw className={`size-4 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Syncing…" : "Sync now"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => open()}
            disabled={!ready || !configured || connecting}
            className="flex items-center gap-2 rounded-lg bg-text-primary px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <Link2 className="size-4" />
            {connecting ? "Connecting…" : connected ? "Link another" : "Connect account"}
          </button>
        </div>
      </div>

      {!configured && !loading ? (
        <div className="card text-sm text-text-secondary">
          Plaid isn&apos;t configured yet. Add{" "}
          <code className="text-text-primary">PLAID_CLIENT_ID</code>,{" "}
          <code className="text-text-primary">PLAID_SECRET</code>, and{" "}
          <code className="text-text-primary">PLAID_ENV=sandbox</code> to{" "}
          <code className="text-text-primary">.env.local</code> (and Vercel), then redeploy.
        </div>
      ) : null}

      {error ? (
        <p className="text-sm text-[var(--color-stress)]">{error}</p>
      ) : null}

      {loading ? (
        <div className="card text-text-muted text-sm">Loading linked accounts…</div>
      ) : connected && overview ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="card">
              <p className="metric-label mb-1">{monthLabel} spending</p>
              <p className="metric-value text-[var(--color-stress)]">
                {fmtUsd(overview.summary.spending)}
              </p>
            </div>
            <div className="card">
              <p className="metric-label mb-1">{monthLabel} income</p>
              <p className="metric-value text-[var(--color-recovery)]">
                {fmtUsd(overview.summary.income)}
              </p>
            </div>
            <div className="card col-span-2 sm:col-span-1">
              <p className="metric-label mb-1">Net cashflow</p>
              <p
                className="metric-value"
                style={{
                  color:
                    overview.summary.net >= 0
                      ? "var(--color-recovery)"
                      : "var(--color-stress)",
                }}
              >
                {overview.summary.net >= 0 ? "+" : "−"}
                {fmtUsd(Math.abs(overview.summary.net))}
              </p>
            </div>
          </div>

          <div className="card space-y-3">
            <p className="metric-label">Accounts</p>
            <ul className="space-y-2">
              {overview.accounts.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-3 rounded-lg bg-surface-raised px-3 py-2.5"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Building2 className="size-4 shrink-0 text-text-muted" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-text-primary">
                        {a.name}
                        {a.mask ? ` ·•${a.mask}` : ""}
                      </p>
                      <p className="text-xs capitalize text-text-muted">
                        {a.institution_name ?? a.subtype ?? a.type ?? "account"}
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 text-sm tabular-nums text-text-primary">
                    {a.current_balance != null ? fmtUsd(a.current_balance) : "—"}
                  </span>
                </li>
              ))}
            </ul>
            {overview.institutions.map((inst) => (
              <button
                key={inst.id}
                type="button"
                onClick={() => disconnect(inst.id, inst.name)}
                className="flex items-center gap-1.5 text-xs text-text-muted transition-colors hover:text-[var(--color-stress)]"
              >
                <Unlink className="size-3" />
                Disconnect {inst.name}
              </button>
            ))}
          </div>

          <div className="card">
            <p className="metric-label mb-3">Recent transactions</p>
            {overview.transactions.length === 0 ? (
              <p className="text-sm text-text-muted">
                No transactions yet — sync may take a minute after linking.
              </p>
            ) : (
              <ul className="max-h-80 space-y-1 overflow-y-auto">
                {overview.transactions.map((t) => {
                  const isOut = t.amount > 0;
                  const label = t.merchant_name ?? t.name ?? "Transaction";
                  return (
                    <li
                      key={t.id}
                      className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-surface-raised"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm text-text-primary">{label}</p>
                        <p className="text-xs text-text-muted">
                          {fmtDate(t.date)}
                          {t.pending ? " · pending" : ""}
                          {t.category_primary
                            ? ` · ${t.category_primary.replace(/_/g, " ").toLowerCase()}`
                            : ""}
                        </p>
                      </div>
                      <span
                        className="shrink-0 text-sm tabular-nums"
                        style={{
                          color: isOut
                            ? "var(--color-stress)"
                            : "var(--color-recovery)",
                        }}
                      >
                        {isOut ? "−" : "+"}
                        {fmtUsd(Math.abs(t.amount))}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      ) : (
        <div className="card space-y-2 text-sm text-text-secondary">
          <p>
            Connect a US bank or credit card to automatically track balances, spending, and
            income — like Origin Finance.
          </p>
          <p className="text-text-muted">
            Use Plaid sandbox credentials in development, then switch to production when ready.
          </p>
        </div>
      )}
    </section>
  );
}
