import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Kova — Privacy",
  description: "Privacy policy for Kova, a personal health dashboard.",
};

export default function PrivacyPage() {
  return (
    <main className="flex min-h-dvh justify-center px-6 py-12">
      <article className="w-full max-w-2xl">
        <header className="mb-8 text-center">
          <div className="metric-label mb-2">Personal Health OS</div>
          <h1 className="text-3xl font-semibold tracking-tight text-text-primary">
            Privacy Policy
          </h1>
          <p className="mt-2 text-sm text-text-muted">Last updated: June 2026</p>
        </header>

        <div className="card space-y-6 p-6 text-sm leading-relaxed text-text-secondary">
          <section>
            <h2 className="mb-2 text-base font-medium text-text-primary">
              Who this applies to
            </h2>
            <p>
              Kova is a personal dashboard built and operated by a single
              individual for private use. It is not a commercial service and
              does not offer accounts to the public. This policy describes how
              data is handled within that context.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-medium text-text-primary">
              What we collect
            </h2>
            <p className="mb-3">
              Data enters Kova only when you connect a source or enter it
              manually:
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong className="text-text-primary">Wearables &amp; fitness</strong>{" "}
                — sleep, readiness, activity, heart rate, and workouts (e.g. via
                Oura Ring OAuth)
              </li>
              <li>
                <strong className="text-text-primary">Manual tracking</strong>{" "}
                — habits, supplements, weight, water, and nutrition logs
              </li>
              <li>
                <strong className="text-text-primary">Finances</strong> — manual
                net-worth and subscription tracking stored in your browser; bank
                data only if you later connect a financial aggregator
              </li>
              <li>
                <strong className="text-text-primary">Workouts (coach)</strong>{" "}
                — gym logs stored in your browser on each device
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-base font-medium text-text-primary">
              How we use it
            </h2>
            <p>
              Data is used solely to display personal health and lifestyle
              metrics in your dashboard. It is not sold, shared with advertisers,
              or used to build profiles for third parties.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-medium text-text-primary">
              Where it is stored
            </h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                Synced health and tracking data lives in a private Supabase
                Postgres database (encrypted at rest by the provider).
              </li>
              <li>
                Integration tokens (Oura, etc.) are encrypted with AES-256-GCM
                before being stored in the database.
              </li>
              <li>
                Some modules keep data only in your browser&apos;s local storage
                and do not upload it to the server.
              </li>
              <li>
                API credentials and encryption keys are stored in server
                environment variables (Vercel), never in the browser.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-base font-medium text-text-primary">
              Third-party services
            </h2>
            <p>
              When you connect an integration, Kova calls that provider&apos;s
              API from the server, caches the results in your database, and
              displays them in the app. Current or planned integrations include
              Oura, Hevy, USDA FoodData Central, Open Food Facts, and
              optionally Plaid for bank data. Each provider has its own privacy
              policy governing the data they hold.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-medium text-text-primary">
              Security
            </h2>
            <p>
              The app is password-protected. Database access is restricted with
              row-level security. Traffic is encrypted in transit (HTTPS). For
              technical details, see{" "}
              <a
                href="https://github.com/parkerhayashi/kova/blob/main/SECURITY.md"
                className="text-text-primary underline underline-offset-2 hover:opacity-80"
              >
                SECURITY.md
              </a>{" "}
              in the project repository.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-medium text-text-primary">
              Retention &amp; deletion
            </h2>
            <p>
              Data is retained for as long as you keep using the app. You can
              delete data by disconnecting integrations, clearing browser
              storage for local-only modules, removing rows from the database,
              or deleting the Supabase project. There is no automated data
              expiry.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-medium text-text-primary">
              Contact
            </h2>
            <p>
              Questions about this policy can be raised via{" "}
              <a
                href="https://github.com/parkerhayashi/kova/issues"
                className="text-text-primary underline underline-offset-2 hover:opacity-80"
              >
                GitHub Issues
              </a>{" "}
              on the project repository.
            </p>
          </section>
        </div>

        <p className="mt-6 text-center text-sm text-text-muted">
          <Link
            href="/login"
            className="text-text-primary underline underline-offset-2 hover:opacity-80"
          >
            Back to Kova
          </Link>
        </p>
      </article>
    </main>
  );
}
