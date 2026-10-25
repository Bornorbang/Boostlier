# Boost Account — SMM Panel integration

## Connection and approved pricing

Backend-only, form-encoded POST requests go to `https://app.smmpanel.ng/api/v2`. The supplied key is saved only in ignored `backend/.env` as `SMM_API_KEY`. It is never included in frontend code, responses or logs. Rotate it by replacing that PHP-owned value and restarting PHP workers/jobs together. Production should inject it through the host's secret environment.

Provider settlement currency is confirmed **NGN** by the authenticated balance endpoint. Rates are NGN per 1,000 units. The owner approved **1 NGN = 0.001 USD** and **100% markup**. Configuration in the `smm_pricing` setting is:

```json
{
  "currency": "NGN",
  "fx_numerator": 1,
  "fx_denominator": 1000,
  "fx_mode": "fixed",
  "markup_basis_points": 10000,
  "rounding_cents": 1
}
```

The rational is USD cents per NGN kobo, so it is also 1/1000. The approved values are included in `backend/config/smm-pricing.json`. Apply them to a fresh database with `php backend/bin/configure.php smm_pricing backend/config/smm-pricing.json`. This is an owner-approved fixed rate, not a claimed live market feed. It does not expire automatically after 24 hours. Market-mode rates for other providers retain their expiry checks.

Provider rate × quantity / 1,000 gives provider total. Exact decimal arithmetic computes kobo; FX and markup are then applied before rounding the final selling amount upward to one penny. Example: provider total ₦2,500 → $1.00 converted cost → **$2.00 customer total**. Retail provider rates, private costs and markups do not appear in catalogue or order responses.

## Customer flow

`/boost-account/new-order` supports category selection, service name/ID search, descriptions, min/max quantities, target URL, current USD quote, wallet balance and a server-confirmed wallet purchase. Default services are supported. Other returned types are labelled as requiring additional fields and cannot be submitted through this form; package/custom-comment/subscription/drip-feed features are not silently approximated as standard quantities.

`/boost-account/orders` displays order references, service, quantity, preserved USD price, status, start count, remaining quantity and refill information. Current-page active orders poll in bounded batches every 15 seconds while visible. Terminal orders stop polling. Provider failures preserve the last state. Manual checks and background jobs also synchronise orders. Refill controls appear only when the purchased service supports them. Pending refill requests are recorded before dispatch and not blindly resubmitted after a timeout.

Cancellation is **unavailable**, irrespective of any generic catalogue `cancel` flag. No cancellation button or outbound cancellation request exists.

## Financial and failure handling

Purchases validate the current service, quantity and price on the server, lock the USD wallet, reserve the accepted amount and persist the original request and provider quote. Provider acceptance saves a receipt, creates the order and captures the reservation. Reusing an idempotency key with the same request returns the recorded intent; different input returns a conflict.

An explicit provider rejection releases the reservation once. HTTP 5xx, transport timeouts, invalid JSON or a missing order identifier are ambiguous: funds stay reserved and the submission appears in history for reconciliation. The provider docs contain neither purchase idempotency nor an intent/order search, so the app cannot safely infer failure or dispatch a replacement. Browser retries retain the original key. Refills use their own durable pending records and owner checks.

The supplied status API does **not** establish the amount actually refunded to the provider wallet after partial/cancelled outcomes. Such statuses are shown honestly and flagged for support review; no proportional customer credit is invented from `remains` or `charge`. Administrator wallet adjustments remain available after verified refund review. Automatic final refunds require additional authoritative refund documentation from the provider.

## Local and production operations

```text
php backend/bin/migrate.php
php backend/bin/smm-check.php
php backend/tests/smm.php
node tests/smm-live.mjs
node tests/smm-browser.mjs
```

`smm-check.php` reads only balance currency and services; it prints counts/types and connection status, never the key or private balance. `smm-live.mjs` reads the actual catalogue/quotes and checks that a zero-balance test customer cannot submit a purchase. It does not purchase a live order. The isolated PHP test suite uses injected mock transports for acceptance, rejection, ambiguity, idempotency, pricing and refill scenarios.

The provider documents 120 requests/minute per account. A shared database rolling window caps this app at 100 requests/minute, leaving headroom. Service snapshots cache for 60 seconds and retain a labelled previous snapshot during failures. Purchases require a fresh service quote. The existing CLI job synchronises SMM orders and refill requests in bounded batches. Do not run additional integrations against this same provider account without sharing the rate budget.

Windows PHP uses its native trusted certificate store while preserving TLS peer/hostname verification. Production needs an up-to-date system CA bundle and PHP cURL/OpenSSL. BCMath is required and declared in Composer. Never disable TLS certificate checks to resolve local trust configuration.

## Reconciling ambiguous submissions

An authorised operator must check the provider account independently. The status endpoint alone cannot verify which target/service/quantity belongs to a provider order, so the CLI requires a private reviewed evidence file matching the exact original request:

```json
{
  "verified_in_provider_account": true,
  "reviewed_by": "authorised operator identifier",
  "note": "Describe the independently checked provider record",
  "service": "provider-service-id",
  "target": "exact original public target URL",
  "quantity": 1000,
  "provider_order_id": "verified provider order ID"
}
```

```text
php backend/bin/smm-reconcile.php attach <intent-id> <private-reviewed-evidence.json>
```

The CLI checks provider status/currency and captures the original USD reservation once. To release a verified unprovisioned intent, use `release` with matching evidence containing `confirmed_not_provisioned: true` instead of a provider order ID. This is an audited operator attestation; the API cannot prove a negative lookup itself. Never release solely because the provider is unavailable, an order is not immediately visible or a user reports no delivery. Evidence files should be retained privately under the approved support retention policy.

## Review record

Seven distinct checks cover contract/capabilities, exact money/FX, durable wallet handling, provider failures/idempotency, ownership/key isolation, real browser/mobile use, and build/operations. Live read-only authentication, NGN currency, catalogue and USD quotes were verified. Twenty isolated SMM tests exercise success/failure paths without spending provider funds. Real paid submission, delivery and refill execution still require a controlled funded acceptance order; none has been represented as tested live.
