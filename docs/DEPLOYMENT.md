# Deployment and operations

The active wallet currency is USD. Apply migration `020_usd_currency.sql` with writes/workers paused and a database backup, then restart all servers and workers. Rename monetary environment variables to `*_CENTS` and update API clients to `*_usd` fields. See [USD migration](USD-MIGRATION.md) for preserved balances, pricing and legacy checkout handling.

Rewards requires migrations through `019_reward_rules.sql`, including `018_referral_oauth.sql` for Google referral attribution. Configure the top-up launch date in admin. See [Rewards](REWARDS.md) for programme settings and accounting boundaries.

Global Numbers requires backend-only `FIVESIM_API_KEY`, migration `016_global_numbers.sql`, and the existing number synchronization worker. Restart that worker after deployment. See [Global Numbers](GLOBAL-NUMBERS.md) for operator selection, pricing and reconciliation behavior.

## Frontend: Vercel

Import the repository as a Next.js project. Install with `npm ci`, build with `npm run build`. Set `NEXT_PUBLIC_SITE_URL` to the chosen canonical HTTPS origin, with no trailing slash, and `BACKEND_URL` to the separately hosted PHP origin. The latter is server-only. No provider key belongs in Vercel or in a `NEXT_PUBLIC_` variable.

The Next.js proxy enforces the configured canonical HTTPS hostname in production and rejects conflicting browser write origins. Security headers deny framing and restrict browser permissions. Configure HSTS at the TLS edge after all canonical/subdomain traffic is HTTPS. Browser API requests use `/api/backend/*`; backend webhooks may use the backend origin directly.

Public prices regenerate briefly and show honest unavailable states without a backend. A successful backend snapshot is retained on provider failure and labelled stale. An initial page built without credentials contains useful descriptions and unavailable tables, never fabricated prices.

## Backend: PHP-FPM + MySQL

1. Install Composer dependencies with `composer install --no-dev --optimize-autoloader` in `backend/`.
2. Create a dedicated database/user. Use MySQL 8+ or MariaDB 10.6+, strict SQL mode, UTC sessions and InnoDB. Disable public database access. Create backups before migrations.
3. Put backend environment variables in the process environment or a private `backend/.env`. Set `APP_ENV=production`, `APP_URL` to the frontend canonical origin and `DB_DSN=mysql:host=...;dbname=...;charset=utf8mb4`.
4. Run `php bin/migrate.php` from `backend/`. Migrations are recorded in `schema_migrations`. MySQL DDL is not fully transactional: inspect and repair partial DDL before rerunning a failed migration. Never delete tables to fix a migration on a live database.
5. Point the web server document root **only** at `backend/public`. Rewrite application requests to `index.php`. Deny direct dotfile access. Never serve `storage`, `src`, `vendor` or migrations.
6. Limit requests to 6 MB; PHP `upload_max_filesize=5M`, `post_max_size=6M`. Keep `display_errors=Off`, `log_errors=On`. Store logs outside the document root. The API logs incident IDs and exception classes, not payloads or secrets.
7. Use HTTPS for every production integration, restrictive filesystem access and a private writable `storage/`. Terminate TLS at a trusted edge. Do not enable wildcard credentialed CORS; the app uses its own server proxy.
8. Register an account, then run `php bin/admin.php <registered-email>` through an authorised host shell. There is no public role-elevation endpoint.

Example nginx location:

```nginx
root /srv/temp-number/backend/public;
location / { try_files $uri /index.php?$query_string; }
location = /index.php {
    include fastcgi_params;
    fastcgi_param SCRIPT_FILENAME $document_root/index.php;
    fastcgi_pass unix:/run/php/php8.4-fpm.sock;
}
location ~ /\. { deny all; }
client_max_body_size 6m;
```

The local PHP built-in server is for development only. SQLite is a local test convenience, not the requested production database. `docker-compose.yml` can provision a local MySQL server after setting its two password variables. MySQL acceptance tests must use a disposable database.

## Stripe

Configure `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and the approved top-up limits in PHP. Use test-mode keys first. Register HTTPS `/webhooks/stripe` on the backend origin for `checkout.session.completed` and `checkout.session.async_payment_succeeded`. Preserve the raw body and Stripe-Signature header. The handler verifies the signature and retrieves the authoritative session again before crediting.

Checkout returns to `<APP_URL>/payment/return?reference=<local-payment-id>`. Return-page verification requires the account owner and does not trust query-string payment outcomes. Webhooks recover a payment when the user closes checkout. If checkout creation timed out before a session reference was saved, its metadata-bearing webhook can still attach and credit the pending record. Do not create another checkout to resolve an unknown paid status; reconcile with Stripe first.

Official references consulted during implementation: [Checkout fulfilment](https://docs.stripe.com/checkout/fulfillment), [create session](https://docs.stripe.com/api/checkout/sessions/create), [session object](https://docs.stripe.com/api/checkout/sessions/object). This adapter is replaceable through `PaymentAdapter`. Live/test payment acceptance remains unverified.

## Google sign-in

Create a web application OAuth client. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in PHP only. Register exactly:

```text
<APP_URL>/api/backend/auth/google/callback
```

The sign-in route redirects server-side to Google; no global Google script is downloaded. The flow uses state, a short-lived HttpOnly cookie and PKCE. Google identity is mapped by stable subject; a matching existing password account is not silently linked. Such customers can use password sign-in/reset. Official protocol reference: [Google web server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server).

## SMTP and support

Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` and `SUPPORT_EMAIL`. SMTP uses authenticated STARTTLS. Test delivery and set SPF/DKIM/DMARC with the selected mail service. Password-reset tokens are hashed, expire in 30 minutes and invalidate previous reset tokens and account sessions when consumed. Support requests persist before mail delivery; the job retries `pending_email` records. Receipts remain private and are downloadable only by authorised administrators through `/admin/support-receipt?id=<ticket-id>`.

## Jobs and reconciliation

Run on one designated backend scheduler each minute:

```cron
* * * * * cd /srv/temp-number/backend && /usr/bin/php bin/jobs.php >> /var/log/temp-number-jobs.log 2>&1
```

Jobs have batch limits, a 45-second scheduling budget and a host-level non-overlap lock. A provider request can finish after that budget; the next iteration still respects the lock. `job_runs` records status, summary and timing. Monitor failed runs, growing `pending`/`reconciliation` queues, stale FX/snapshots and support-email backlog. On multiple backend nodes, run the scheduler on only one node or replace the host lock with a distributed lease. Financial idempotency still lives in the database.

Short-term jobs synchronise provider status; unresolved intents are looked up, never blindly purchased again. Renewal jobs use order/previous-expiry uniqueness and insufficient-funds checks. Inboxes expire locally without asserting a refund. Payment jobs verify known pending sessions. Product receipt recovery uses saved trusted receipts and original request payloads.

```text
php bin/reconcile.php
php bin/reconcile.php <intent-id>
```

The first lists unresolved intents. The second can attach an already saved trusted receipt or use authoritative provider intent lookup. Only an explicit authoritative `not_provisioned` outcome releases reserved funds. When lookup is unavailable, the command leaves the reservation unchanged. Providers without an intent lookup need a documented operator receipt-verification method before enabling those actions. Never edit wallet balances directly in SQL.

## Backup, recovery and rotation

Use encrypted daily database backups and point-in-time recovery where supported, plus private support attachment backups. Define retention with the owner. Test restoration into an isolated environment and compare wallet balances, reservation totals, ledger references and unresolved intents before serving traffic. Restore database and attachment snapshots consistently; reconcile later external events before reopening purchases. The ledger is append-only at the application layer; production database permissions should prevent routine modification/deletion of ledger and audit rows.

Rotate provider credentials in the PHP process environment only and restart PHP workers/jobs together. There is no second provider-key copy in Next.js. Rotate Stripe webhook secrets with its supported overlap process, verify delivery and then remove the old secret. Account API rotation hashes a fresh key and revokes the prior credential without altering orders. SMTP/Google secret rotation requires updating their PHP values and checking delivery/sign-in afterwards. Revoke sessions and reset affected account passwords after an account incident.


For full Numbers timeout refunds with closed browsers, supervise `php backend/bin/number-expiry-worker.php --watch`, or schedule the existing jobs command frequently. The worker uses the database deadline and performs no provider purchase. Apply migration 013 before starting it. See NUMBERS.md for customer refund policy and validation.

For fixed-term Rentals, apply migrations 014/015 and retain the minute jobs scheduler for status and pending-operation recovery. Auto-renew is disabled; extensions are manual. Rental expiry does not refund the duration purchase. See RENTALS.md for the provider extension ambiguity policy and controlled live acceptance check.

Supervise php backend/bin/number-sync-worker.php --watch for two-way provider status updates for Numbers and Long-term Rentals while browsers are closed. It checks existing resources only; it does not submit new purchases, extensions or cancellation requests. Use one worker instance; the process lock prevents overlap. Monitor artifacts locally and your configured service logs in production. See RENTALS.md.
