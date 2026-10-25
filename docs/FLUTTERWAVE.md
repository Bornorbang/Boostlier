# Flutterwave wallet funding

Boostlier uses Flutterwave v3 Standard hosted checkout. Customers choose a USD wallet amount and can pay in a supported local currency. The original USD credit and checkout currency/amount are stored separately; provider prices, order charges and wallet refunds remain USD.

## Configuration

In the private `backend/.env`, set:

```
FLW_SECRET_KEY=your_v3_secret_key
FLW_SECRET_HASH=your_random_webhook_secret_hash
MIN_TOPUP_CENTS=100
MAX_TOPUP_CENTS=1000000
```

The minimum is $1 (or a higher configured minimum). The default maximum is $10,000. No public key is needed for server-created Standard checkout. No real Flutterwave credentials were provided during this integration; payments remain disabled until configured.

Restart long-running PHP workers after changing credentials, and restart/redeploy the frontend after changing its private proxy/hosting environment. The PHP web process reads backend configuration per request in the local development server.

In Flutterwave Settings → Webhooks, use `https://YOUR_DOMAIN/api/backend/webhooks/flutterwave`, set the same secret hash, and enable retries. Disable **Enable Dashboard Payment Options** so the per-payment `payment_options` selection is respected. Enable the relevant collection currencies/payment methods on the merchant account and confirm Flutterwave accepts the business category before live acceptance. Merchant approval determines actual availability.

`APP_URL` in backend/.env and `NEXT_PUBLIC_SITE_URL` in frontend environment must be the same public HTTPS origin. Keep the PHP origin private or limit it to the frontend/recovery workers. Stripe is now the default when configured; customers can select Flutterwave when its credentials are also configured. Both providers retain independent verification and recovery.

## Country selection

IP-based country inference uses the hosting edge rather than sending customer IPs to a third-party geolocation API. Vercel uses its `x-vercel-ip-country` automatically. For Cloudflare set `IP_GEOLOCATION_PROVIDER=cloudflare` in the frontend environment. A standalone deployment can use manual selection or deploy behind one of these edges.

`BACKEND_PROXY_SECRET` must match the private frontend and backend environment values. A local shared secret has been installed. The frontend forwards only the chosen edge country header plus this private secret; the backend ignores untrusted country headers. Cloudflare deployments must prevent origin bypass and ensure the edge overwrites the country header. Never set a trusted-edge mode on an origin where clients can inject its headers. This inference is a suggestion, not identity verification; customers can always change their payment country. Localhost has no public client country and defaults to “Other / pay in USD”.

Supported suggestions: Nigeria (NGN: card/transfer/USSD), Ghana (GHS: card/mobile money), Kenya (KES: card/M-Pesa), Uganda (UGX), Rwanda (RWF), Tanzania (TZS), South Africa (ZAR), UK (GBP), euro area (EUR), USA/other (USD). Unsupported countries fall back to USD card checkout. Flutterwave filters unavailable methods further.

## Quote and checkout

1. `/payments/options` returns the inferred country, choices, configuration status and USD funding bounds.
2. `/payments/quote` calculates a local amount server-side using Flutterwave's transfer-rates endpoint: local source currency, USD destination, destination amount equal to the requested wallet credit. Currency pair and returned USD amount are checked. A failed conversion request explicitly falls back to USD card checkout. No guessed conversion rate is used.
3. A quote lasts five minutes. The wallet form stays minimal. Flutterwave shows the final local payment amount on its hosted checkout before the customer pays. Local charge amounts round upwards to their currency's minor unit; verification rounds down so fractional underpayments cannot slip through.
4. `/payments/checkout` accepts only an owned quote ID. A locked quote can create one local payment, with a unique `boostlier_…` reference. Reusing the quote reuses its saved checkout URL. An ambiguous creation timeout retains a pending payment and does not automatically repeat the purchase request. Customers can check it from top-up history. A new quote is a separate payment intent.
5. Flutterwave collects payment on its hosted site. Boostlier does not collect card credentials. Local methods/currencies still depend on merchant enablement. The conversion quote is a Boostlier checkout price, not a Flutterwave FX trade or a settlement/conversion instruction. Merchant settlement currency, FX execution, fees and any customer-side Flutterwave fees follow the merchant/provider setup; they require live account acceptance and reconciliation.

## Verification and recovery

The hosted return page and signed webhooks independently re-query Flutterwave by the stored transaction reference. Credit requires a successful provider status, matching reference/currency and at least the expected local amount. Callback query parameters alone never credit a wallet. The wallet credit is exactly the original USD amount; extra local payment does not increase it automatically and should be reconciled by an administrator.

Wallet ledger reference `topup:PAYMENT_ID`, payment locking and the existing wallet lock prevent duplicate credits across callbacks, refreshes and concurrent workers. Successful funding is recorded as a real `topup`, so existing top-up rewards work without treating administrative credits as deposits. Failed/pending payments give no credit. Later verified success can recover a previously failed attempt. Webhook payloads and credentials are not written to logs.

`php backend/bin/payment-worker.php --watch` recovers pending Flutterwave payments without processing unrelated support/provider operations. Run it under a supervisor, or run without `--watch` every minute with cron. The general jobs command can also recover payments. A local hidden worker has been started; production supervision, alerting and reboot persistence still need deployment setup. Storage/focus events refresh wallet balances in other open app tabs; navigating back to the wallet reloads its history/balance.

## Validation / acceptance

- `php backend/tests/flutterwave.php`: configuration gating, country-header trust, amounts, mismatches, pending/duplicate credit and webhook signatures.
- `node tests/flutterwave-integration.mjs --browser`: isolated PHP application plus mock Flutterwave, local quotes, checkout retry, verified webhooks, exact USD credits, FX fallback, ownership, desktop/mobile previews and hosted redirect. No real charge is made.
- Core wallet, rewards and admin regressions; TypeScript/static checks; production build.

Seven review passes cover provider contract, country trust, FX/rounding, checkout retry/ownership, verification/duplicate credit, browser/mobile experience, and recovery/configuration. Before going live, supply credentials, set the public webhook URL/hosting-edge configuration, confirm enabled currencies/methods and settlement arrangements, then perform controlled sandbox and live success/failure/duplicate-webhook acceptance. SMTP configuration is unrelated to payment keys.

Provider references: [Standard API](https://developer.flutterwave.com/reference/checkout), [payment methods](https://developer.flutterwave.com/docs/payment-methods), [transfer rates](https://developer.flutterwave.com/reference/check-transfer-rates), [verification by reference](https://developer.flutterwave.com/reference/verify-transaction-with-tx_ref), [webhooks](https://developer.flutterwave.com/docs/webhooks).
