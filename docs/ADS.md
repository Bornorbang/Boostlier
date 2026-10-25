# Community banner ads

Customers access `/dashboard/ads` from the Ads sidebar item. This is a board inside the authenticated dashboard, visible to signed-in Boostlier customers.

## Customer flow

1. Enter an ad title and public HTTP/HTTPS website link.
2. Upload a PNG, JPEG or WebP banner (maximum 2 MB; minimum 300 × 100 pixels; recommended 1200 × 400).
3. Review the banner and payment confirmation.
4. Pay **$10.00** from the existing USD wallet. The banner appears immediately in Community ads for **one calendar month**.
5. My ads shows the customer's active, expired and removed placements, with London expiry dates. The owner can remove an active ad after confirming that the placement fee is not refunded.

There is no subscription or automatic renewal. A new paid submission is a new placement. Banner and website links open the advertiser's site in a new tab, with `noopener noreferrer sponsored`. The board labels placements Sponsored.

`ADS_PRICE_CENTS` controls pricing on the backend and defaults to `1000`. No provider API or external billing credentials are needed. One month is calculated in Europe/London, clamping dates such as 31 January to the last day of February. The board and image endpoint enforce expiry without depending on a scheduled job.

## Backend and storage

Migration `008_ads.sql` adds account-owned ad records, stored image metadata, an input fingerprint, an account-scoped idempotency key, charged integer-cents price, status and UTC start/expiry timestamps.

- `GET /api/backend/ads?page=1&per_page=12`: active community placements, owner history and current price.
- `POST /api/backend/ads/create`: multipart `title`, `target_url`, `banner`, optional `max_price_usd`; requires `Idempotency-Key`.
- `POST /api/backend/ads/remove`: JSON `id` and `confirmed: true`; owner-only.
- `GET /api/backend/ads/banner?id=ID`: authenticated image delivery. Only active placements are accessible to other customers; the owner can view their own historical banners.

Uploads live in ignored `backend/storage/`, outside the public document root. PHP verifies real MIME type, image dimensions and size; SVG and invalid images are rejected. The upload route accepts only genuine PHP uploaded files. Generated filenames prevent path traversal. Wallet debit and ad insertion happen in one database transaction. Failure rolls back the debit and removes the staged file. Replaying the same purchase returns its recorded ad without another charge; reusing the key for different content is rejected. The browser retains its purchase key after a network failure.

Disabled advertisers are excluded from the board. Existing account administration can disable an abusive advertiser. This first version publishes immediately; it does not include a moderation queue, click analytics or recurring placements.

## Verification and seven review areas

1. Product flow: banner upload, preview, explicit payment confirmation, community visibility, owner history and early removal.
2. Finance: server-controlled $10 pricing, exact integer cents, insufficient-funds denial, maximum-price bounds and repeat-request deduplication.
3. Failure handling: database failure after upload rolls back the ledger and cleans up the file; no separate payment system was added.
4. Uploads and access: byte-based MIME validation, image limits, private storage, authenticated banners, owner-only removal, escaped titles and safe external link attributes.
5. Calendar and lifecycle: month-end/leap-year/DST checks, immediate publication, automatic expiry filtering and non-refunding removal.
6. Presentation: desktop and mobile/dark screenshots visually inspected; browser checks cover sidebar routing, preview, wallet updates, active images, tabs, confirmations and mobile overflow.
7. Regression: production Next build, strict TypeScript/four source checks, PHP syntax, 14 Ads backend tests and 15 existing HTTP checks pass. `node tests/ads-browser.mjs` verifies the complete flow using a local QA account with test-only wallet credit; no real top-up is used. Production MySQL concurrency remains a deployment acceptance check.

Commands: `php backend/bin/migrate.php`, `php backend/tests/ads.php`, `node tests/ads-browser.mjs`.
