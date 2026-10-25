# Vercel frontend and cPanel backend

The repository contains both services. Import the repository root into Vercel;
deploy only `backend/` to cPanel. Do not upload the local database or `.env` files.

## 1. cPanel

1. Create a MySQL database and database user with access to that database.
2. Upload the backend to `/home/CPANEL_USER/boostlier/backend` outside `public_html`.
   Install dependencies there with `composer install --no-dev --optimize-autoloader`.
3. Create an API subdomain, for example `api.boostlier.com`, with its document root
   set to `/home/CPANEL_USER/boostlier/backend/public`. Enable HTTPS/AutoSSL.
   If your host restricts document roots to `public_html`, ask it to allow this
   layout. Do not expose the entire backend to make the restriction work.
4. Select PHP 8.4 in MultiPHP Manager (PHP 8.2+ is supported), including PDO MySQL,
   cURL, BCMath, mbstring, fileinfo and OpenSSL. Match the CLI PHP version.
5. Copy `backend/.env.example` to the private `backend/.env`. Set:

   ```dotenv
   APP_ENV=production
   APP_URL=https://boostlier.com
   DB_DSN=mysql:host=localhost;dbname=CPANEL_DATABASE;charset=utf8mb4
   DB_USER=CPANEL_DATABASE_USER
   DB_PASSWORD=YOUR_DATABASE_PASSWORD
   BACKEND_PROXY_SECRET=YOUR_RANDOM_SHARED_SECRET
   TEMP_MAIL_PRICE_CENTS=100
   SUPPORT_EMAIL=support@boostlier.com
   ```

   Populate the provider and SMTP credentials privately. Use a new random shared
   secret of at least 32 bytes; use the same value on Vercel. Do not copy a local
   Windows `CURL_CA_BUNDLE` path: use the host system CA store or a valid host path.
   `APP_URL` is the frontend URL, not the API subdomain.
6. Ensure `storage/` exists and is writable by PHP, with private permissions.
   Keep `.env` readable only by the account/PHP user. Do not use world-writable 777.
7. In cPanel Terminal, from the private backend directory:

   ```sh
   php bin/migrate.php
   ```

   Apply all migrations through 025 on a fresh database. Never import the local
   development database into production. Register your production account and
   promote it using `php bin/admin.php YOUR_EMAIL`. Use a new, strong password.
8. Check `https://api.boostlier.com/health` returns `{"status":"ok"}`.
   Verify `/.env`, `/src/bootstrap.php`, `/storage/` and `/vendor/` are inaccessible.
   The included `.htaccess` provides Apache routing and disables directory listings.
   If the host does not honour `.user.ini`, configure the supplied limits in
   MultiPHP INI Editor instead.

## 2. Vercel

Import `Bornorbang/Boostlier`, branch `main`, root directory `.` and framework
Next.js. The checked-in configuration uses Node 22, `npm ci` and `npm run build`.
Do not use a static export: authentication and API proxy routes need the server.

Add production environment variables before deploying:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | `https://boostlier.com` (no trailing slash) |
| `BACKEND_URL` | `https://api.boostlier.com` (no trailing slash) |
| `BACKEND_PROXY_SECRET` | Same private random secret as PHP |
| `IP_GEOLOCATION_PROVIDER` | `vercel` |

Provider, SMTP, payment and database secrets belong on cPanel only. Browser
requests go through the same-origin Vercel API proxy; no credentialed CORS is
needed. Add your frontend domain in Vercel and follow its displayed DNS records.
Keep API and mail DNS records pointing to their existing hosts.

Use a separate backend/database for Preview deployments. Set each preview's
`NEXT_PUBLIC_SITE_URL` and backend `APP_URL` to matching preview origins: the
canonical redirect and origin checks deliberately reject mismatched origins.
Do not let previews purchase from the live production wallet/database.

## 3. Payments and email

Configure live Stripe keys and register the API backend URL
`https://api.boostlier.com/webhooks/stripe` in Stripe. Store that endpoint's signing
secret in PHP; the local CLI signing secret cannot be used for production.
Use the events listed in [STRIPE.md](STRIPE.md). Test-mode keys intentionally
cannot start production wallet checkouts. If testing payments on staging, use
an isolated staging database and follow the Stripe test-mode setup first.

Verify SMTP delivery, SPF/DKIM/DMARC and reset links pointing to the frontend.
If Google sign-in is enabled, register the callback at
`https://boostlier.com/api/backend/auth/google/callback`.

## 4. cPanel Cron Jobs and background processing

Use the actual PHP CLI executable provided by your host (for example
`/usr/local/bin/ea-php84`); verify it with `-v`. Schedule on one host only:

```cron
* * * * * cd /home/CPANEL_USER/boostlier/backend && /usr/local/bin/ea-php84 bin/jobs.php >> storage/jobs.log 2>&1
* * * * * cd /home/CPANEL_USER/boostlier/backend && /usr/local/bin/ea-php84 bin/number-sync-worker.php >> storage/number-sync.log 2>&1
* * * * * cd /home/CPANEL_USER/boostlier/backend && /usr/local/bin/ea-php84 bin/payment-worker.php >> storage/payments.log 2>&1
```

Jobs sends queued mail, handles expiries/refunds and refreshes Boost orders.
These cron commands run once and return; do not pass `--watch` to cron. Monitor
logs, queued operations, job_runs and payment settlement, and rotate logs.

The USA price warmer can take longer than shared-hosting execution limits.
Run `php bin/number-price-worker.php --watch` under a host-supported supervisor,
or have the host supply an equivalent persistent worker. Supervised mail and
number-sync workers improve latency over minute cron schedules. If the host
prohibits long-running workers, resolve that hosting limit before promising an
always-warm catalogue; do not launch overlapping unlimited cron processes.

## 5. Acceptance before public paid traffic

Run MySQL migration/concurrency acceptance, sign-up/sign-in/reset, each provider's
controlled purchase/status/refund flow, live payment/webhook wallet credit,
queued email delivery and backup/restore. Finish the remaining items in
[LAUNCH-READINESS.md](LAUNCH-READINESS.md). A Git push is not a live deployment.

References: [Vercel environment variables](https://vercel.com/docs/environment-variables),
[cPanel cron configuration](https://support.cpanel.net/hc/en-us/articles/360053606793-How-to-create-or-edit-cron-jobs-in-the-cPanel-user-interface),
[cPanel PHP configuration](https://docs.cpanel.net/ea4/php/about-php/).
