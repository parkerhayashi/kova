# Kova — Security Practices

Kova is a **single-user personal health dashboard** operated by one individual for private use. It is not a commercial product and has no external users or employees. This document describes the security controls in place and how to report issues.

**Last updated:** June 2026

## Security contact

| | |
|---|---|
| **Name** | Parker Hayashi |
| **Role** | Owner / Developer |
| **Contact** | Open a private security advisory on [GitHub](https://github.com/parkerhayashi/kova/security/advisories/new) or email the address associated with the GitHub account |

## Scope

Kova aggregates personal health and lifestyle data (Oura Ring, habits, weight, workouts, nutrition, finances) into a private Next.js dashboard backed by Supabase Postgres. Third-party API credentials are used only on the server; the browser reads cached data from the database.

## Access control

- **Application gate:** The entire app is protected by a password (`KOVA_PASSWORD`). A successful login sets an HttpOnly, `SameSite=Lax` session cookie signed with HMAC-SHA256 (`AUTH_SECRET`). Without a valid session, pages redirect to `/login` and API routes return `401`.
- **Login rate limiting:** Failed password attempts are capped at 10 per IP per 15-minute window (`lib/rate-limit.ts`). Excess attempts receive a `Retry-After` response and a lockout message on the login page.
- **Least privilege:** Integration secrets (Oura, Hevy, Strava, Plaid, Supabase service role, cron secret, encryption key) exist only in server-side environment variables. They are never exposed to client components or `NEXT_PUBLIC_*` variables.
- **Database:** All tables have Row Level Security enabled with no permissive policies, so the public anon key cannot read or write rows. The application uses the Supabase service role exclusively in server-side code.
- **Cron routes:** `/api/sync/*` endpoints authenticate with a `Bearer` token (`CRON_SECRET`), not the session cookie.
- **OAuth:** Third-party OAuth flows use a random `state` value stored in an HttpOnly cookie to prevent CSRF.

## Encryption

- **In transit:** Production is served over HTTPS (TLS 1.2+) via Vercel. All server-to-provider API calls use HTTPS.
- **At rest (integration tokens):** OAuth and aggregator access tokens are encrypted with AES-256-GCM before being written to Postgres (`TOKEN_ENCRYPTION_KEY`).
- **At rest (application data):** Health and synced data are stored in Supabase Postgres with provider-level disk encryption.
- **Browser-local data:** Some modules (manual finances tracker, gym coach) store data in the browser's `localStorage` on each device. This data is not synced to Supabase and is protected only by the app password gate.

## Authentication limitations

- End-user access is **password-only** (no MFA/TOTP/WebAuthn yet). This is acceptable for a single-operator personal app but is a known gap if the deployment URL becomes widely known.
- Sessions are stateless signed tokens (30-day expiry). Logging out clears the cookie; revoking a stolen session requires rotating `AUTH_SECRET` or `KOVA_PASSWORD`.

## Infrastructure accounts

The operator maintains multi-factor authentication on accounts that hold production secrets:

- GitHub (source + secrets)
- Vercel (environment variables)
- Supabase (database + service role key)
- Third-party developer portals (Oura, Strava, Plaid when enabled)

## Vulnerability management

- **Dependabot** opens weekly PRs for npm dependency updates (`.github/dependabot.yml`).
- **CI audit:** `npm audit --audit-level=high` runs on every push to `main` and on pull requests (`.github/workflows/audit.yml`).
- Apply security patches promptly; review Dependabot PRs before merging.

## Data retention and deletion

- **Retention:** Data is kept indefinitely for personal historical analysis unless manually deleted. There is no automated purge schedule.
- **Deletion:** The operator can delete data by:
  - Disconnecting integrations (removes stored tokens)
  - Deleting rows in Supabase (via dashboard or SQL)
  - Clearing browser `localStorage` for client-only modules
  - Deleting the Supabase project or Vercel deployment entirely

See the [Privacy Policy](https://kova-os.vercel.app/privacy) for a user-facing summary.

## Incident response

For a solo personal app, incident response is: rotate affected secrets immediately, revoke third-party tokens, review Vercel/Supabase access logs, and redeploy. Report suspected vulnerabilities via the security contact above.

## Known gaps (planned improvements)

- End-user MFA (TOTP or passkey)
- Explicit consent copy before third-party connect flows
