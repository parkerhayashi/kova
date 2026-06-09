/**
 * Server-side Plaid finance data — link items, sync accounts/transactions,
 * read helpers for the /finances dashboard. Service client only.
 */
import { decryptToken, encryptToken } from "@/lib/crypto";
import {
  exchangePublicToken,
  getAccounts,
  getInstitution,
  removeItem,
  syncTransactions,
  type PlaidAccount,
  type PlaidTransaction,
} from "@/lib/plaid";
import { createServiceClient } from "@/lib/supabase/server";
import { todayInTimezone } from "@/lib/utils";
import { getTimezone } from "@/lib/data/oura";
import type { FinancialAccount, FinancialTransaction, PlaidItem } from "@/types";

function mapAccount(plaidItemId: string, a: PlaidAccount) {
  return {
    plaid_item_id: plaidItemId,
    plaid_account_id: a.account_id,
    name: a.name,
    official_name: a.official_name,
    type: a.type,
    subtype: a.subtype,
    mask: a.mask,
    current_balance: a.balances.current,
    available_balance: a.balances.available,
    iso_currency_code: a.balances.iso_currency_code ?? "USD",
    updated_at: new Date().toISOString(),
  };
}

function mapTransaction(t: PlaidTransaction) {
  const pfc = t.personal_finance_category;
  return {
    plaid_transaction_id: t.transaction_id,
    plaid_account_id: t.account_id,
    amount: t.amount,
    iso_currency_code: t.iso_currency_code ?? "USD",
    date: t.date,
    authorized_date: t.authorized_date,
    name: t.name,
    merchant_name: t.merchant_name,
    pending: t.pending,
    payment_channel: t.payment_channel,
    category_primary: pfc?.primary ?? null,
    category_detailed: pfc?.detailed ?? null,
    personal_finance_category: pfc ?? null,
    updated_at: new Date().toISOString(),
  };
}

export async function getPlaidItems(): Promise<PlaidItem[]> {
  const db = createServiceClient();
  const { data } = await db.from("plaid_items").select("*").order("created_at");
  return (data as PlaidItem[]) ?? [];
}

export async function isPlaidConnected(): Promise<boolean> {
  const items = await getPlaidItems();
  return items.length > 0;
}

/** Exchange a Link public_token, store the item, sync accounts + transactions. */
export async function linkPlaidItem(
  public_token: string,
  institutionName?: string | null,
): Promise<{ item_id: string; accounts: number; transactions: number }> {
  const exchanged = await exchangePublicToken(public_token);
  const db = createServiceClient();

  const { data: existing } = await db
    .from("plaid_items")
    .select("id")
    .eq("item_id", exchanged.item_id)
    .maybeSingle();

  let rowId: string;
  if (existing?.id) {
    await db
      .from("plaid_items")
      .update({
        access_token: encryptToken(exchanged.access_token),
        institution_name: institutionName ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    rowId = existing.id;
  } else {
    const { data: inserted, error } = await db
      .from("plaid_items")
      .insert({
        item_id: exchanged.item_id,
        access_token: encryptToken(exchanged.access_token),
        institution_name: institutionName ?? null,
      })
      .select("id")
      .single();
    if (error || !inserted) throw new Error(error?.message ?? "Failed to save Plaid item.");
    rowId = inserted.id;
  }

  const result = await syncPlaidItem(rowId);
  return { item_id: exchanged.item_id, ...result };
}

/** Sync one linked item — refresh balances and pull new transactions. */
export async function syncPlaidItem(
  plaidItemRowId: string,
): Promise<{ accounts: number; transactions: number }> {
  const db = createServiceClient();
  const { data: item } = await db
    .from("plaid_items")
    .select("*")
    .eq("id", plaidItemRowId)
    .maybeSingle();

  if (!item) throw new Error("Plaid item not found.");

  const accessToken = decryptToken((item as PlaidItem).access_token);
  const accountsRes = await getAccounts(accessToken);

  if (accountsRes.item.institution_id && !(item as PlaidItem).institution_name) {
    const inst = await getInstitution(accountsRes.item.institution_id);
    if (inst) {
      await db
        .from("plaid_items")
        .update({
          institution_id: inst.institution_id,
          institution_name: inst.name,
        })
        .eq("id", plaidItemRowId);
    }
  }

  const accountRows = accountsRes.accounts.map((a) =>
    mapAccount(plaidItemRowId, a),
  );
  if (accountRows.length > 0) {
    const { error } = await db
      .from("financial_accounts")
      .upsert(accountRows, { onConflict: "plaid_account_id" });
    if (error) throw new Error(`financial_accounts: ${error.message}`);
  }

  let cursor = (item as PlaidItem).sync_cursor;
  let txCount = 0;
  let hasMore = true;
  while (hasMore) {
    const page = await syncTransactions(accessToken, cursor);
    if (page.added.length > 0) {
      const { error } = await db
        .from("financial_transactions")
        .upsert(page.added.map(mapTransaction), {
          onConflict: "plaid_transaction_id",
        });
      if (error) throw new Error(`financial_transactions add: ${error.message}`);
      txCount += page.added.length;
    }
    if (page.modified.length > 0) {
      const { error } = await db
        .from("financial_transactions")
        .upsert(page.modified.map(mapTransaction), {
          onConflict: "plaid_transaction_id",
        });
      if (error) throw new Error(`financial_transactions mod: ${error.message}`);
    }
    if (page.removed.length > 0) {
      const ids = page.removed.map((r) => r.transaction_id);
      await db
        .from("financial_transactions")
        .delete()
        .in("plaid_transaction_id", ids);
    }
    cursor = page.next_cursor;
    hasMore = page.has_more;
  }

  await db
    .from("plaid_items")
    .update({
      sync_cursor: cursor,
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", plaidItemRowId);

  return { accounts: accountRows.length, transactions: txCount };
}

/** Sync all linked Plaid items. */
export async function syncAllPlaid(): Promise<{
  items: number;
  accounts: number;
  transactions: number;
}> {
  const items = await getPlaidItems();
  if (items.length === 0) throw new Error("No bank accounts linked.");

  let accounts = 0;
  let transactions = 0;
  for (const item of items) {
    const r = await syncPlaidItem(item.id);
    accounts += r.accounts;
    transactions += r.transactions;
  }
  return { items: items.length, accounts, transactions };
}

export async function disconnectPlaidItem(plaidItemRowId: string): Promise<void> {
  const db = createServiceClient();
  const { data: item } = await db
    .from("plaid_items")
    .select("access_token")
    .eq("id", plaidItemRowId)
    .maybeSingle();
  if (!item) return;

  try {
    await removeItem(decryptToken(item.access_token));
  } catch (err) {
    console.warn("[plaid] item/remove failed:", (err as Error).message);
  }

  await db.from("plaid_items").delete().eq("id", plaidItemRowId);
}

export interface FinanceOverview {
  connected: boolean;
  institutions: { id: string; name: string; last_synced_at: string | null }[];
  accounts: (FinancialAccount & { institution_name: string | null })[];
  summary: {
    month: string;
    spending: number;
    income: number;
    net: number;
  };
  transactions: FinancialTransaction[];
}

/** Dashboard payload for the linked-accounts panel on /finances. */
export async function getFinanceOverview(): Promise<FinanceOverview> {
  const db = createServiceClient();
  const tz = await getTimezone();
  const today = todayInTimezone(tz);
  const monthStart = today.slice(0, 7) + "-01";

  const { data: items } = await db.from("plaid_items").select("*").order("created_at");
  const plaidItems = (items as PlaidItem[]) ?? [];

  if (plaidItems.length === 0) {
    return {
      connected: false,
      institutions: [],
      accounts: [],
      summary: { month: monthStart.slice(0, 7), spending: 0, income: 0, net: 0 },
      transactions: [],
    };
  }

  const { data: accounts } = await db
    .from("financial_accounts")
    .select("*")
    .order("name");

  const itemNames = new Map(
    plaidItems.map((i) => [i.id, i.institution_name]),
  );
  const accountRows = ((accounts as FinancialAccount[]) ?? []).map((a) => ({
    ...a,
    institution_name: itemNames.get(a.plaid_item_id) ?? null,
  }));

  const { data: monthTxns } = await db
    .from("financial_transactions")
    .select("amount, pending")
    .gte("date", monthStart)
    .lte("date", today)
    .eq("pending", false);

  let spending = 0;
  let income = 0;
  for (const t of monthTxns ?? []) {
    const amt = Number(t.amount) || 0;
    if (amt > 0) spending += amt;
    else income += Math.abs(amt);
  }

  const { data: recent } = await db
    .from("financial_transactions")
    .select("*")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(40);

  return {
    connected: true,
    institutions: plaidItems.map((i) => ({
      id: i.id,
      name: i.institution_name ?? "Linked account",
      last_synced_at: i.last_synced_at,
    })),
    accounts: accountRows,
    summary: {
      month: monthStart.slice(0, 7),
      spending,
      income,
      net: income - spending,
    },
    transactions: (recent as FinancialTransaction[]) ?? [],
  };
}
