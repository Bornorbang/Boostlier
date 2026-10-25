# Number rentals

Customer page: `/dashboard/rentals`. Administrator page: `/admin/rentals`. The former `/dashboard/long-term` URL redirects to Rentals. Single-use Numbers remains separate.

Rentals use TextVerified US mobile SMS numbers for one selected service. Supported periods are 1, 3, 7, 14, 30 and 90 days, or one year, subject to provider availability. Customers receive multiple messages throughout the rental period. Extensions retain the same number and add the selected period to the existing expiry. There is no automatic renewal or supplier billing cycle.

The approved rental calculation is **USD 1 = USD 1, plus USD 1 per purchase or extension**. For example, USD 2.40 costs USD 3.40. The `long-term_pricing` setting is separate from the single-use verification markup of USD 0.70. Admin Pricing & settings exposes both rental FX and margin. All charges are calculated in the backend, capped by the accepted USD quote and recorded in the existing wallet ledger. Supplier price increases after acceptance do not silently increase the customer charge.

## Provider contract

Implementation was checked against the official v2 OpenAPI at https://backend.textverified.com/swagger/v2/swagger.json on 19 October 2026. It uses the existing backend-only TextVerified credentials and bearer-token cache.

- Services: GET `/api/pub/v2/services`, mobile/nonrenewable.
- Inventory and pricing: POST `/api/pub/v2/inventory/rentals` and `/api/pub/v2/pricing/rentals`.
- Purchase: POST `/api/pub/v2/reservations/rental`, fixed term, SMS, nonrenewable, back orders disabled. Follows the returned sale link and then the assigned rental link.
- Details: GET `/api/pub/v2/reservations/rental/nonrenewable/{id}`.
- Extension: POST `/api/pub/v2/reservations/rentals/extensions`.
- Messages: GET `/api/pub/v2/sms`, scoped to the reservation ID and nonrenewable type. Recipient and pagination links are validated.
- Cancellation: POST `/api/pub/v2/reservations/rental/nonrenewable/{id}/refund`, only when fresh provider details allow it. Wallet refund follows confirmed refunded status.

Expiration ends access; it does **not** refund a duration-based rental. Eligible cancellations refund the original purchase charge once. Extensions are non-refundable. This differs from the single-use Numbers timeout policy.

## Persistence and recovery

Apply migrations 014 and 015 with `php backend/bin/migrate.php`. Rental resources use existing `orders`, with duration, refund eligibility and details URL. Operations use existing fulfilment intents and ledger plus durable `number_rental_requests` dispatch/receipt records. All customer reads/actions check ownership; inbox access checks local expiry before and after provider retrieval, plus provider state.

New purchases send a stable provider Idempotency-Key and retain the original payload and sale link. Local retries reuse the wallet operation. The extension endpoint has no documented idempotency guarantee: an uncertain extension is never automatically posted twice. Recovery checks the same number/service and the expected expiry increase; otherwise the operation stays reserved for administrator review. A second extension is blocked while another is unresolved. Definitive rejection releases the reservation once.

Run the existing `backend/bin/jobs.php` each minute on the designated scheduler for pending-operation recovery and rental status synchronization. The customer can also refresh status or use Check outcome. Admin can filter/search rentals, inspect details/messages, synchronize, request eligible cancellation, inspect pending operations, and manage pricing. Existing Login-as-user also permits customer flows for support.

Authenticated backend routes under `/number-rentals`: GET listing/catalogue/messages; POST quote/purchase/extend/status/cancel/recover. Browser requests pass through the existing `/api/backend` proxy. Legacy `/long-term` listing and action aliases use the same handlers.

## Validation

`php backend/tests/number-rentals.php` covers pricing, availability, wallet limits, purchase/extension retries, ambiguous recovery, ownership/expiry, leading-zero SMS codes, message recipient validation, safe links and eligible refunds. `node tests/rentals-browser.mjs` covers the customer UI with fixture rental responses and real local authentication. `node tests/admin-browser.mjs` checks authenticated admin routing, including Rentals. Desktop/mobile screenshots are in ignored `artifacts/`.

A live read-only catalogue and Google seven-day quote succeeded. No paid live rental or extension was purchased during implementation. Run a controlled funded live purchase before production launch to verify the provider's actual allocation, SMS delivery, extension eligibility and refund window on this account.

## Implementation review (19 October 2026)
Reviewed pricing/ledger capture, retry recovery, ownership/expiry, supplier response validation, cancellation/refund boundaries, administrator controls and browser layouts. Admin now scopes record access to the selected service, shows elapsed rentals as expired immediately, formats rental durations, renders readable SMS, and exposes operation history, confirmed wallet refunds and pending-recovery links. Provider sale IDs must match their returned links; extension recovery cannot reactivate refunded/inactive rentals. Regression coverage: 18 rental tests, 21 admin tests, core wallet tests, customer/admin browser checks and a production build. Paid live purchase/extension acceptance remains outstanding as documented above.

## Live response compatibility fix (20 October 2026)
Live paid sale records exposed three response differences from the original fixtures: reservation serviceName can be the catalogue display name rather than service ID; the returned reservation link can use /reservations/{id}?type=Nonrenewable; that generic endpoint returns a further Link object. The adapter now verifies the returned host, ID and type, then reads the documented nonrenewable detail endpoint directly, matching either the catalogue ID or its exact display name. Confirmed purchases finish in the original request. Definitively refunded acknowledged purchases reconcile to cancelled and release their existing wallet holds once. The two previously stuck local operations were confirmed refunded upstream and their holds released without new purchases. Rental regression suite: 22 passing tests; core wallet suite: 42 passing tests.

## Two-way status synchronization
Boostlier cancellation sends the provider's supported cancellation/refund action and applies confirmed provider state. Provider-side cancellations/refunds are read by the shared NumberSync poller for single-use Numbers and Long-term Rentals. The long-term dashboard requests a customer-scoped sync every 15 seconds while visible; due rows are claimed in the database to limit duplicate polling. Provider failures leave local state and funds unchanged. Status checks never purchase or extend numbers.
Supervise php backend/bin/number-sync-worker.php --watch in production for closed-browser synchronization (15-second cycles, ten due resources per batch, shared provider rate limit). It is running locally. The existing minute jobs command remains a fallback. At scale, detection can take longer when rows queue or the provider rate-limits; this integration polls rather than claiming instantaneous webhook delivery. Recent expired long-term rentals are checked less frequently for late provider refunds. Rentals always returns ten newest records per page; actions remain one line in a horizontally scrollable table.
