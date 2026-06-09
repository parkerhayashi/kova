/**
 * Plaid API client — server-side only. Uses the REST API directly so we don't
 * need the full Plaid SDK for Link + Transactions Sync.
 *
 * Env: PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV (sandbox | production)
 */

export type PlaidEnv = "sandbox" | "production";

function plaidEnv(): PlaidEnv {
  const env = process.env.PLAID_ENV ?? "sandbox";
  return env === "production" ? "production" : "sandbox";
}

function plaidBase(): string {
  return plaidEnv() === "production"
    ? "https://production.plaid.com"
    : "https://sandbox.plaid.com";
}

function credentials(): { client_id: string; secret: string } {
  const client_id = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  if (!client_id || !secret) {
    throw new Error("PLAID_CLIENT_ID and PLAID_SECRET must be set.");
  }
  return { client_id, secret };
}

async function plaidPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${plaidBase()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...credentials(), ...body }),
  });
  const data = (await res.json()) as T & { error_message?: string; error_code?: string };
  if (!res.ok) {
    const msg = data.error_message ?? data.error_code ?? res.statusText;
    throw new Error(`Plaid ${path}: ${msg}`);
  }
  return data;
}

export interface PlaidLinkTokenResponse {
  link_token: string;
  expiration: string;
}

/** Create a Link token for the Plaid Link modal (transactions product, US only). */
export async function createLinkToken(clientUserId = "kova-user"): Promise<PlaidLinkTokenResponse> {
  return plaidPost<PlaidLinkTokenResponse>("/link/token/create", {
    user: { client_user_id: clientUserId },
    client_name: "Kova",
    products: ["transactions"],
    country_codes: ["US"],
    language: "en",
  });
}

export interface PlaidExchangeResponse {
  access_token: string;
  item_id: string;
}

export async function exchangePublicToken(
  public_token: string,
): Promise<PlaidExchangeResponse> {
  return plaidPost<PlaidExchangeResponse>("/item/public_token/exchange", {
    public_token,
  });
}

export interface PlaidAccount {
  account_id: string;
  name: string;
  official_name: string | null;
  type: string;
  subtype: string | null;
  mask: string | null;
  balances: {
    current: number | null;
    available: number | null;
    iso_currency_code: string | null;
  };
}

export interface PlaidAccountsResponse {
  accounts: PlaidAccount[];
  item: { institution_id: string | null };
}

export async function getAccounts(access_token: string): Promise<PlaidAccountsResponse> {
  return plaidPost<PlaidAccountsResponse>("/accounts/get", { access_token });
}

export interface PlaidInstitution {
  institution_id: string;
  name: string;
}

export async function getInstitution(
  institution_id: string,
): Promise<PlaidInstitution | null> {
  try {
    const data = await plaidPost<{ institution: PlaidInstitution }>(
      "/institutions/get_by_id",
      {
        institution_id,
        country_codes: ["US"],
      },
    );
    return data.institution;
  } catch {
    return null;
  }
}

export interface PlaidTransaction {
  transaction_id: string;
  account_id: string;
  amount: number;
  iso_currency_code: string | null;
  date: string;
  authorized_date: string | null;
  name: string;
  merchant_name: string | null;
  pending: boolean;
  payment_channel: string | null;
  personal_finance_category?: {
    primary?: string;
    detailed?: string;
  } | null;
}

export interface PlaidTransactionsSyncResponse {
  added: PlaidTransaction[];
  modified: PlaidTransaction[];
  removed: { transaction_id: string }[];
  next_cursor: string;
  has_more: boolean;
}

/** Cursor-based transaction sync — call in a loop until has_more is false. */
export async function syncTransactions(
  access_token: string,
  cursor?: string | null,
): Promise<PlaidTransactionsSyncResponse> {
  const body: Record<string, unknown> = { access_token };
  if (cursor) body.cursor = cursor;
  return plaidPost<PlaidTransactionsSyncResponse>("/transactions/sync", body);
}

export async function removeItem(access_token: string): Promise<void> {
  await plaidPost("/item/remove", { access_token });
}

export function isPlaidConfigured(): boolean {
  return Boolean(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET);
}
