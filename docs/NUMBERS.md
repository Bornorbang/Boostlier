# Numbers: TextVerified

## Current scope

`/dashboard/numbers` is the single number-verification dashboard. `/dashboard/usa` and `/dashboard/global` redirect there. The sidebar, mobile navigation, main-service cards and purchase links use the unified destination. New orders use TextVerified exclusively; existing legacy provider identifiers remain readable on historical records. International ordering is disabled. Long-term/dedicated products are not enabled by this verification integration.

The dashboard offers US mobile SMS verification: searchable service selection, current stock and USD quote, confirmation, number copying, automatic status checks, code copying, full SMS text, supported cancellation and account-owned history. Recently completed orders remain in the main list for one hour so the delivered code does not disappear. All history remains accessible separately. Mobile rows show the number and code without horizontal scrolling.

## Owner-approved pricing

The fixed conversion is **USD 1 = USD 1**, plus **USD 1.00 per order**. This is an owner-selected commercial conversion, not a market FX feed. For example, a provider price of USD 0.75 produces a USD 1.75 selling price. Integer cents/cents are used, with fractional provider cents rounded upwards. Retail and API price configuration currently use the same 100-cent flat margin.

Backend credentials:

- `TEXTVERIFIED_API_KEY`
- `TEXTVERIFIED_API_USERNAME` (the provider account email)

Neither credential belongs in Next.js/public variables. Bearer tokens are cached only in the backend database, keyed by a credential fingerprint and respecting provider expiry. Rotating the key/email invalidates the token cache naturally.

For deployment, run migrations and `php backend/bin/textverified-configure.php`. This applies `backend/config/textverified-pricing.json` to the existing settings table. `php backend/bin/textverified-check.php google` performs only catalogue, inventory and price checks; it does not purchase a number.

## Verified provider contract

The pasted examples were supplemented with the current [official API reference](https://www.textverified.com/docs/api/v2), its linked [OpenAPI schema](https://backend.textverified.com/swagger/v2/swagger.json), and the provider's [official Python client](https://textverified-python.readthedocs.io/en/latest/quickstart.html). The schema was downloaded and reviewed directly. Necessary endpoints:

| Method | Path | Use |
| --- | --- | --- |
| POST | `/api/pub/v2/auth` | Generate/refresh bearer token using backend key and account email |
| GET | `/api/pub/v2/services?numberType=mobile&reservationType=verification` | SMS-capable service list |
| POST | `/api/pub/v2/inventory/verifications` | Confirm current stock |
| POST | `/api/pub/v2/pricing/verifications` | Confirm provider cost before reserving wallet funds |
| POST | `/api/pub/v2/verifications` | Buy one verification with a stable provider idempotency key and maximum cost |
| GET | Returned verification details link | Assigned number, expiry, state and cancellation capability |
| GET | `/api/pub/v2/sms?reservationId=ID&reservationType=verification` | Reservation-scoped SMS, including `parsedCode` |
| POST | `/api/pub/v2/verifications/ID/cancel` | Attempt an eligible cancellation, then re-read authoritative status |

The live provider returns Pascal-case capability names such as `Sms`, despite lower-case schema enum examples; comparisons handle that. Bodyless POSTs explicitly send an empty body because the live auth host rejects a POST without a content length. Returned links are restricted to HTTPS, approved TextVerified hosts and the API v2 path before credentials are sent. Redirects to arbitrary hosts are not followed.

Voice, carrier/area-code selection, reuse, reactivation, reporting, long-term rentals and outgoing SMS are excluded from this first interface. Provider mock services and special “service not listed” configurations are excluded from the customer service list.

## Wallet and recovery

The existing rental/ledger mechanism reserves the accepted USD price before dispatch, then captures once after a valid assigned-number receipt. New migration `009_textverified.sql` stores token/catalogue caches, durable vendor request data and saved follow-up links, plus provider state/cancellation metadata on number orders.

The provider supports `Idempotency-Key` on verification creation. Boostlier uses its durable local intent to build that key and saves the exact vendor request including `maxPrice`. A timeout or provider idempotency conflict leaves funds reserved. The retry/reconciliation path resends the identical provider request under the same key, or uses a saved details link without another create POST. Definitive documented 400 rejection releases the reservation once. A local activation failure is recoverable through saved receipts. Existing scheduled jobs continue reconciling pending orders.

Cancellation capability is checked before sending an action; status and SMS are re-read afterwards. A completed label without a real `parsedCode` is not treated as code delivery. Codes are strings so leading zeroes survive. SMS recipients must match the assigned number, and all customer order reads/actions are owner-checked.

Automatic monetary refunds require an explicit provider `verificationRefunded` state plus an empty reservation SMS list. A cancellation response, timed-out window, provider outage or missing code alone is not treated as proof of a refund. Other terminal/no-code states remain “Confirming outcome” for reconciliation. This conservative boundary needs a controlled real paid no-SMS acceptance test before expanding automated refund rules. No paid provider order was placed during implementation.

## App/API endpoints

- Session-authenticated `GET /numbers/services` and `POST /numbers/quote` power the dashboard through the existing `/api/backend` proxy.
- Existing `POST /rent`, `/status`, `/cancel`, and `GET /rentals` remain wallet/account guarded.
- Existing reseller `GET /api/v1/prices` now lists service identifiers; `?service=ID` returns a live USD price and stock. API-key rental/status/cancellation remain compatible, with additional products documented in [Developer API](DEVELOPER-API.md).

No provider balance, token, credential or raw USD cost is sent to the browser.

## Seven review passes and evidence

1. **Requirements and navigation:** one Numbers dashboard/provider; old country routes redirect; public number CTAs and pricing now point to service-specific quotes.
2. **Provider contract:** checked current schema and SDK, then confirmed real authentication, 2,341 SMS services and live stock/pricing. Live provider-defined `test_success` returned a mock receipt and SMS code `123456` without billing or real-number creation.
3. **Money:** 23 isolated PHP tests cover approved FX/flat margin, stock checks, caps, insufficient funds, one capture, rejection release, ambiguous dispatch, stable vendor retry keys and saved-link recovery.
4. **Ownership/security:** tests cover account ownership, recipient validation, foreign-link rejection and no refunds on outage/labels alone. Provider credentials remain backend-only; client source/public build assets were scanned for the actual key value.
5. **Lifecycle:** code strings preserve leading zeroes; full SMS is saved/displayed; cancellation checks capabilities; explicit refunds settle once. Browser testing found and fixed immediate removal of delivered codes from the active list.
6. **Presentation:** browser checks cover the real service list/USD quote and insufficient-funds flow, then explicitly simulated customer delivery/polling/code copying. Desktop and mobile/dark screenshots were reviewed; number/code rows now stack on mobile. Old country route redirects pass.
7. **Regression/operations:** strict TypeScript, source checks, production build, PHP syntax, the 42 core wallet tests, 22 SMM tests, 21 temporary-email tests and existing HTTP/browser checks were exercised. Deployment settings and read-only diagnostics are committed. Production MySQL locking, real paid number delivery and live no-SMS cancellation/refund remain acceptance checks.

Run `php backend/tests/textverified.php` and `node tests/numbers-browser.mjs`. The browser test's successful order/SMS is a fixture; live provider mock testing is separate and explicitly non-billing.


## Direct-purchase service table update

The Numbers page now places the alphabetical service table beside active/recent numbers. The guide card, service selector, separate Get number button and confirmation modal have been removed. A priced row purchases immediately using that displayed USD amount as the server-enforced maximum. Search and ten-service pages keep the provider request load bounded. `POST /numbers/prices` accepts up to ten service IDs, retrieves price-only data, caches provider costs for five minutes and applies the current configured USD margin server-side. No wallet change or provider purchase occurs when browsing prices. Actual purchase always checks fresh stock and cost; if the price increased, it stops and refreshes the displayed price rather than charging more. All purchases still use the existing durable keys, wallet reservation/capture and recovery behavior.

The updated browser check covers row ordering, right-aligned prices, side-by-side layout, no confirmation dialog, insufficient funds, double-click protection, delivered SMS visibility and mobile layouts. Backend TextVerified coverage now includes 24 checks, including price-only lookup without inventory/purchase requests.

## Rental table visibility

The table shows an unlabelled country flag, Number, Service, Code, Status and an unlabelled action column. Codes show a spinner while waiting; eligible active numbers have a red Cancel button. Only active and completed, unexpired rentals appear, newest first, with ten per page. Accepted cancellations disappear immediately; financial reconciliation continues independently and refunds still require provider confirmation. Migration 010 stores this visibility separately from settlement state. Backend coverage includes 26 checks; `node tests/number-rentals-browser.mjs` checks columns, spinners, cancellation, expiry, pagination and mobile overflow.


## Scrollable service catalogue and favourites

The service table scrolls without search or pagination. Heart buttons toggle favourites, pinning them above the remaining alphabetical catalogue without purchasing. Favourites persist in browser storage scoped to the signed-in account. Prices load for rows near the viewport in batches of at most ten; row clicks retain immediate purchase and the displayed maximum price check. `node tests/number-favourites-browser.mjs` verifies persistence, pinning/unpinning, heart isolation, viewport price batches, direct purchase and mobile overflow.


## Saved catalogue prices and restored search

Search is restored and filters the complete local catalogue immediately. This supersedes the viewport price loading described above: GET `/numbers/services` returns the full service/USD price snapshot in one response. Scrolling, favourites and search make no pricing requests. The page quietly refreshes that snapshot every five minutes (every thirty seconds only during initial population), keeping existing rows visible. No provider costs are exposed.

Run `php backend/bin/number-price-worker.php --watch` as a supervised background process in production, or schedule `php backend/bin/number-price-worker.php` to refresh due prices. A nonblocking file lock prevents duplicate workers. It gradually fills the initial catalogue, then refreshes saved quotes every six hours, retaining prior quotes during outages. Initial population requires one read-only pricing request per service and therefore takes time under the provider request limit. Unpopulated rows explicitly show Price pending; failed availability differs from pending. There are no scroll-triggered price spinners. A purchase still checks fresh inventory and price, enforces the displayed maximum, and publishes newly checked quotes back into the saved catalogue. All USD amounts are calculated from provider costs using the current server pricing settings.

The local worker writes progress to `artifacts/number-prices.log` and errors to `artifacts/number-prices-error.log`. Browser tests cover search, saved prices for offscreen rows, reloads, favourites and direct purchase with no row-price requests. The backend's 28 TextVerified tests include complete local snapshots, current markup application and preservation of prices during upstream failures.


## Full customer refunds on cancellation and timeout

This policy supersedes the earlier supplier-credit-only refund rule for the current TextVerified Numbers service. An accepted cancellation, provider-confirmed cancelled/timed-out verification or the stored local verification deadline refunds the entire captured USD customer charge when no code has been delivered. The captured purchase ledger debit determines the amount, including Boostlier markup; later pricing/order configuration changes cannot change it. A failed cancellation attempt or a temporary outage before the deadline does not itself cancel the number. Completed/code-delivered orders are not refunded. Unknown provisioning without a captured charge still follows the existing reserved-funds reconciliation path.

Refunds use the existing unique `refund:ORDER_ID` ledger reference, order/wallet locking and terminal-state guards. Supplier refunds arriving later cannot duplicate a customer credit. Migration 013 records customer refund amount, reason and timestamp separately from the supplier state, and each successful credit is audited. The server expires/refunds due orders before listing numbers, returning wallet balance or starting a new purchase. The shared navbar wallet also refreshes after expiry as well as cancellation.

Run `php backend/bin/number-expiry-worker.php --watch` as a supervised production process for five-second local deadline checks, or use scheduled `php backend/bin/jobs.php`, which also processes due refunds. The local watch worker is running with logs in `artifacts/number-expiry.log` and `artifacts/number-expiry-error.log`. Closed browsers do not prevent worker refunds. This is Boostlier's customer policy and does not claim that the supplier wallet was credited.

Validation: 33 isolated TextVerified checks, 42 core checks, and `php backend/tests/number-refund-concurrency.php` (12 simultaneous processes, one full refund). No live paid verification was purchased for testing.
