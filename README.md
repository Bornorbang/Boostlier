# Boostlier

Deployment target: **Vercel frontend + cPanel PHP/MySQL backend**. Follow the
[deployment checklist](docs/VERCEL-CPANEL.md) for environment variables, document
root, migrations, webhooks and scheduled jobs. Secrets and local data are excluded
from Git. Pushing source does not deploy either hosting environment.

See [current launch readiness](docs/LAUNCH-READINESS.md) for verified checks and remaining production blockers.

Rewards provides monthly spending bonuses, seven-day order streaks, 1% dashboard rental cashback, 5% qualifying deposit bonuses and cumulative referral milestones, with atomic wallet claims and administrator controls. See [Rewards](docs/REWARDS.md).

Global Numbers is connected to 5sim, with highest-success-rate operator selection per country and approved USD 1 = USD 1 plus USD 1.00 pricing. See [Global Numbers](docs/GLOBAL-NUMBERS.md) for retry safety, synchronization and validation limits.

UK-focused social promotion and SMS number rental application: Next.js App Router / TypeScript / Tailwind frontend, separately hosted PHP API, transactional MySQL schema, and USD wallet accounting.

**Local build, not a live production service.** Boost Account is connected to SMM Panel using backend-only credentials and owner-approved USD pricing. Temporary email is connected to Privatix RapidAPI at $1.00 per 24-hour access period or renewal. The unified Numbers dashboard is connected to TextVerified for US mobile SMS verification, using the approved fixed USD/USD conversion and 100-cent flat markup. No stock, customer statistics or successful orders are simulated. See [docs/BOOST-ACCOUNT.md](docs/BOOST-ACCOUNT.md), [docs/TEMPORARY-EMAIL.md](docs/TEMPORARY-EMAIL.md), [docs/NUMBERS.md](docs/NUMBERS.md), [HANDOVER.md](HANDOVER.md) and [docs/REVIEW.md](docs/REVIEW.md) for integration details and verification limits.

See [USD migration and pricing](docs/USD-MIGRATION.md) for the current wallet currency, exact markups and migration validation.

## Run locally

Requirements: Node.js 22+, PHP 8.2+ with PDO, cURL, BCMath, fileinfo, mbstring and OpenSSL, Composer. SQLite PDO is used for convenient local development; production uses MySQL 8+ or MariaDB 10.6+ with InnoDB.

```powershell
npm.cmd ci
composer install --working-dir=backend
Copy-Item .env.example .env.local
Copy-Item backend/.env.example backend/.env
php backend/bin/migrate.php
```

In separate terminals at the project root:

```powershell
php -S 127.0.0.1:8080 -t backend/public backend/public/index.php
```

```powershell
npm.cmd run dev
```

Open http://localhost:3000 and register an account. The wallet starts at $0.00. No demo login or hardcoded administrator exists. On PowerShell, use `npm.cmd` if local execution policy blocks `npm.ps1`. On Linux/macOS, use `npm`.

Promote a registered account from the backend host:

```text
php backend/bin/admin.php your-registered-email
```

## Verify

```powershell
npm.cmd run check
php backend/tests/run.php
php backend/tests/concurrency.php
npm.cmd run build
```

With both servers running:

```powershell
node tests/http.mjs
node tests/admin.mjs
php backend/tests/admin.php
node tests/admin-browser.mjs
node tests/browser.mjs
```

The browser script uses the locally installed Windows Edge executable. Set its executable path for another machine. Screenshots go into ignored `artifacts/`. Runtime tests create test accounts only in the local database. The administrator suite is local-only and promotes its own generated QA account through the CLI, then tests permitted operations and replay protection. Unit tests use an isolated in-memory SQLite database. Concurrency tests use separate ignored SQLite files and twelve real PHP processes. MySQL concurrency and live external-provider verification remain deployment acceptance checks.

## Structure

| Path | Purpose |
| --- | --- |
| `src/app` | Server-rendered public content, route metadata, private route groups, API proxy |
| `src/components` | Responsive marketing site, authentication, customer/admin screens |
| `src/lib` | Shared configuration, currency/date formatting, API contract, purchase keys |
| `backend/src` | Authentication, exact wallet ledger, pricing, settlement, payments, rewards, provider contracts |
| `backend/migrations` | Ordered, versioned portable SQL migrations |
| `backend/bin` | Migrations, administration, commercial configuration, jobs, reconciliation |
| `backend/tests` | Financial, settlement, permissions and concurrency checks |
| `docs` | Deployment, commercial decisions, provider contracts, review record |

Developer documentation is at `/developers` and `/dashboard/api`; `/openapi.json` is generated from the same 34 service operation definitions. The browser calls the PHP backend through a same-origin server proxy. Only PHP owns payment/provider credentials.

Follow [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) before hosting. Approved service pricing and local transactional email are configured. Stripe test-mode funding is configured and sandbox-tested; live keys/webhook acceptance remain. Flutterwave funding is implemented but needs its credentials; production infrastructure still needs setup. See [docs/CONFIGURATION.md](docs/CONFIGURATION.md).

Fixed-term number Rentals are implemented at /dashboard/rentals, with separate administrator management and approved USD 1 = USD 1 plus USD 1.50 pricing per purchase or extension. See [docs/RENTALS.md](docs/RENTALS.md).

Flutterwave wallet funding supports trusted hosting-edge country suggestions, user country overrides, local-currency quotes, hosted checkout, verified USD credits, signed webhooks and recovery. See [docs/FLUTTERWAVE.md](docs/FLUTTERWAVE.md) for activation and acceptance steps.

Stripe is the default hosted wallet checkout when configured. Local test keys, webhook forwarding and payment recovery are installed. See [docs/STRIPE.md](docs/STRIPE.md) for verified behavior and live activation.
