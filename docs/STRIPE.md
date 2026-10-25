# Stripe wallet funding

Stripe test-mode funding is configured locally. Keys and the CLI webhook signing secret are private in `backend/.env`; no secret key is referenced in frontend source. Stripe is the default when configured. Flutterwave remains available if its own credentials are configured, in which case the wallet offers a provider selector and its country/local-currency flow.

## Flow

The customer enters a USD wallet amount (minimum $1, or a higher configured minimum), reviews the amount, then chooses **Fund Wallet**. Stripe opens a hosted Checkout page with the account email prefilled. Stripe controls the enabled payment methods on that page. The integration disables Adaptive Pricing so session amount/currency remain the exact USD wallet amount. There is no subscription, card storage in Boostlier, or discount/promotion-code flow. The wallet form keeps only the amount, suggestions and funding button; extra checkout summaries and test-mode copy were removed at the owner's request. Test/live safeguards remain server-side.

The authenticated backend creates a five-minute owned quote with `provider=stripe`. An accepted quote creates one pending payment and a stable idempotency key `topup:PAYMENT_ID`. Stripe's hosted session ID/URL are saved against that payment. Retrying the quote reuses its payment/session. If session creation times out, recovery reissues the same parameters/key for up to 23 hours; it never recreates an ambiguous older session after Stripe's minimum 24-hour key-retention window. The stored account email makes retried creation parameters stable after profile edits.

Success returns to `/payment/return?reference=LOCAL_PAYMENT_ID`; cancelling returns to the wallet with an informational message. The return page verifies via the backend and polls pending payments briefly. Verified success displays an animated confirmation and spinner for four seconds, then replaces the route with /dashboard. Pending, failed and unverified payments never trigger that success redirect. The displayed callback status never controls wallet credit.

## Verification

Signed webhooks and manual/worker verification retrieve the Checkout Session from Stripe before applying credit. Required matches include local payment ID, user ID, client reference, session ID, currency, exact integer amount, payment mode and test/live environment where supplied by Stripe. Only `payment_status=paid` credits the wallet. Expired and asynchronously failed checkouts do not credit it. Delayed successful payments can still recover after an earlier failure.

The existing wallet transaction, wallet lock and unique `topup:PAYMENT_ID` ledger reference prevent duplicate credit across callbacks, refreshes and workers. Successful funding is also audited and qualifies for existing top-up rewards. No customer wallet data or service charges changed currency.

## Local operation

- The official Stripe CLI is installed in ignored `artifacts/tools/stripe/stripe.exe`.
- A hidden listener runs `backend/bin/stripe-local.ps1`, forwarding test events to `http://127.0.0.1:8080/webhooks/stripe`. The matching signing secret is already configured. Listener logs in artifacts are private and include the signing secret; do not publish them.
- `php backend/bin/payment-worker.php --watch` reconciles pending Stripe and Flutterwave payments independently of the browser. It has been reloaded locally.
- Both processes stop on machine restart. Start the CLI helper in a local terminal or hidden process and supervise the payment worker again when needed.
- PHP's local cURL build lacked a trusted CA store. The official Mozilla bundle from `https://curl.se/ca/cacert.pem` is installed in private storage and configured through `CURL_CA_BUNDLE`. Certificate verification remains enabled. Keep this bundle current; production should use its maintained system trust store or an equivalent configured bundle.

The supplied publishable key is stored privately for future use; server-created hosted Checkout does not require loading it into frontend JavaScript.

## Production configuration

Set `APP_ENV=production`, public HTTPS `APP_URL`, production database/secrets and `STRIPE_SECRET_KEY=sk_live_…`. New Stripe funding is deliberately disabled in production with a test key or missing webhook signing secret. Do not copy the QA database or test-funded balances into production.

Register `https://YOUR_DOMAIN/api/backend/webhooks/stripe` in Stripe Workbench and configure that endpoint's live signing secret as `STRIPE_WEBHOOK_SECRET`. Subscribe to:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`

The CLI's local signing secret is different from a hosted endpoint's secret. Configure supervised payment recovery, webhook monitoring, account-enabled payment methods and settlement details. Controlled live-mode acceptance remains a deployment step; test keys cannot collect real payments. Existing launch-readiness requirements still apply.

## Verification performed

Seven review passes cover API contract/TLS, quote ownership and bounds, stable checkout retry/recovery, webhook authenticity and provider re-verification, exact/concurrent-safe wallet credit, browser/mobile behavior, and local/production operation.

- Eleven Stripe unit checks cover mode/configuration, USD quotes, bounds, expiry/ownership, unpaid/expired handling, mismatch rejection, one-time credit and webhook signatures.
- Isolated mock HTTP/browser integration covers checkout retries, false paid callback data, forged signatures, repeated callbacks/verification, account isolation and desktop/mobile hosted redirects.
- Core wallet, Flutterwave and rewards regressions, TypeScript/static checks and production build pass.
- A real Stripe sandbox Checkout was completed with the documented test card in an isolated QA database. The real CLI-forwarded `checkout.session.completed` webhook returned HTTP 200 and credited exactly $1. The payment was already successful before manual verification; two further verification calls retained one ledger credit and a $1 balance. No customer wallet was credited by this acceptance test and no real money was charged.

Run `php backend/tests/stripe.php`, `node tests/stripe-integration.mjs --browser`, and the existing payment/core regressions. The committed integration test uses mocks and cannot charge a real card. Real sandbox acceptance scripts and test database are private artifacts, not production tooling.

References: [Checkout Sessions](https://docs.stripe.com/api/checkout/sessions/create), [idempotent requests](https://docs.stripe.com/api/idempotent_requests), [webhook handling](https://docs.stripe.com/webhooks), [local forwarding](https://docs.stripe.com/cli/listen).
