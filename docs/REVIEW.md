# Seven review passes

These are seven distinct reviews of the local implementation, with corrections and verification limits recorded. They are not a promise that software has no defects or that unconnected providers have been tested.

| Pass | Scope | Checks and findings |
| --- | --- | --- |
| 1 | Requirements, content and architecture | Compared the requested public/customer/admin routes, product separation, USD/en-GB/London rules, navigation and server/backend ownership. Kept provider-dependent inventory honest; documented missing owner decisions and provider adapters in HANDOVER.md. Public facts replace invented statistical claims. |
| 2 | Compilation and source consistency | Strict TypeScript, production Next.js build, PHP syntax checks, four source/configuration checks, installed lockfiles and dependency audit output. Corrected catalogue key consistency and formatted frontend/test source for review. |
| 3 | Wallet, settlement and recovery | 42 PHP tests cover exact decimal handling, credit deduplication, reservations/capture/rollback, ownership, leading-zero codes, no-code statuses, confirmed refunds, outages, purchase replay, separate pricing, DST rewards, duplicate claims, SMM validation, webhook signatures, inbox activation recovery and renewal/receipt replay. |
| 4 | Actual concurrency | Twelve independent PHP purchase processes cannot overspend the test wallet. Twelve concurrent replays of one operation create one charge. Tests use SQLite with real competing connections; MySQL/InnoDB verification remains outstanding. |
| 5 | Running HTTP application | Fifteen HTTP checks cover all public routes/metadata, initial pricing/unavailable HTML, real 404 status, private noindex, backend authentication/admin denial, registration, profile, unavailable-provider/no-charge behaviour, key rotation, payment ownership, cross-origin protection, MIME validation/support cooldown, logout/login and generated OpenAPI endpoints. Found and corrected subpage Open Graph inheritance and a private-route HTTP-200 soft 404 caused by streaming. |
| 6 | Real browser and responsive behaviour | Headless installed Edge checks desktop/mobile rendering, one homepage H1, light/dark controls, mobile menu, mobile overflow, signup, dashboard navigation and checkout unavailable feedback. No browser page errors observed. Captured and visually inspected public/dashboard screenshots. Centred empty-state icons and added real vector country flags for primary catalogues. |
| 7 | Operational/security handover | Reviewed credential ownership, unavailable-service semantics, append-only ledger use, CLI jobs/reconciliation, deployment/env instructions, support attachment isolation, API key hashing/rotation, canonical redirects, legal drafts, server-rendered private robots metadata and outstanding launch acceptance. Added retained browser purchase keys for network retries and bounded renewal prices. Re-ran affected checks after fixes. |

## Evidence commands

```text
npm run check
npm run build
php backend/tests/run.php
php backend/tests/concurrency.php
node tests/http.mjs
node tests/admin.mjs
node tests/browser.mjs
php backend/bin/jobs.php
php backend/bin/reconcile.php
```

Build output produces the requested public pages and private route groups. The HTTP and browser suites require both local servers. A further six local administrator checks passed: CLI-only role promotion, idempotent wallet adjustment/inspection, customer search without password hashes, self-disable prevention, announcement CRUD, and customer reward inspection. The built client assets were searched for backend credential variable names; no matches were found. Screenshots are local QA artefacts in ignored `artifacts/`. Runtime QA accounts and receipt uploads exist only in ignored local storage. No real credentials were used.

## Still requires verification

Live GetAText/5sim, long-term/dedicated provider capabilities, temporary-email/SMM fulfilment and lifecycle outcomes; Stripe sandbox/live checkout/webhooks; Google configured-client sign-in; actual SMTP/reset/support delivery; production MySQL migrations/locking; hosting/TLS/cron/backups/restore; owner-approved commercial and legal policies. See HANDOVER.md and the provider acceptance contract. None of these external checks is labelled passed.

## Dual-service positioning update

Boostlier now presents Boost Account and Numbers & SMS as its two main services. Seven review areas were checked for this update: (1) balanced homepage and shared brand copy; (2) public navigation and retained number sub-routes; (3) the new `/social-boosting` and `/numbers` pages, metadata and sitemap; (4) logged-out CTA destinations and signup copy; (5) equal dashboard service cards, actual account statistics and mobile Boost access; (6) desktop/mobile/light/dark screenshots and overflow checks; and (7) production build, HTTP status/authentication checks and browser regressions. Service pricing, wallet accounting and provider integrations were not changed by this presentation update.

`node tests/positioning-browser.mjs` verifies equal-sized desktop service cards, both CTA destinations, both public service hubs, retained long-term navigation, mobile navigation and the authenticated dashboard. The production build, existing HTTP suite and browser suite pass. Updated screenshots are in ignored `artifacts/two-services-*` files.


## Temporary email integration: seven review passes

1. **Provider contract:** checked current RapidAPI endpoint definitions and provider overview. Live domain lookup established that current RapidAPI routes require the documented exact paths without the older format suffix. An unused live inbox returns the recognised empty response. The UI discloses the provider's 1-2-hour message retention separately from Boostlier's 24-hour application access.
2. **Authentication and access:** reviewed the authenticated `/api/temp-mail` proxy and PHP handlers, owner checks before and after remote reads, deletion revocation, expiry enforcement, and mailbox membership before a global message lookup. Existing cross-origin and unauthenticated HTTP checks pass.
3. **Wallet accounting:** 21 temporary-email tests verify the configured 70-cents create/renew price, integer balances, price caps, reserve/capture, one release on generation failure, input-bound retries, interrupted-operation recovery, same-address renewal from existing expiry, and unchanged funds on denied operations.
4. **Concurrency:** eight competing generation replays create one inbox and charge once; eight competing renewal replays extend once and charge once. These are independent PHP processes using isolated SQLite connections. Production MySQL locking is still an acceptance item.
5. **Dashboard and accessibility:** browser checks cover live generation, copying, refresh, a text-only message modal with fixture sender/subject/preview/content, explicit provider-error presentation, deletion confirmation, expiry, wallet refresh, dark theme and mobile layout. Desktop and mobile screenshots were visually reviewed; mobile rows now expose all actions without horizontal scrolling.
6. **Regression and build:** strict TypeScript, four source checks, production Next build, PHP syntax checks, 42 core backend tests, 22 SMM backend tests and 15 running HTTP checks pass. The temporary-email browser suite was rerun after the mobile layout update. Live incoming email has not been sent; message rendering uses explicit browser fixtures and backend membership tests.
7. **Secrets and operations:** the supplied key is only in ignored backend configuration. A scan confirms its value is absent from frontend source and built public assets. Migration 007 is applied locally. The existing job runner recovers pending local generation older than 60 seconds. Endpoint, price, expiry, retention and deployment details are documented in TEMPORARY-EMAIL.md; README and HANDOVER now reflect the connected integration.


## TextVerified and unified Numbers

The current delivery boundary and seven distinct review passes are recorded in [NUMBERS.md](NUMBERS.md). This supersedes the original unconnected-number-provider notes above. The owner selected TextVerified only, a fixed USD 1 = USD 1 conversion and a 70-cents flat margin. Existing USA/global dashboard URLs redirect to `/dashboard/numbers`.

Live authentication, service list, stock and USD quotes were exercised. The provider's documented non-billing mock completed with code `123456`. Customer purchase/SMS browser scenarios use explicit fixtures, while wallet/retry/refund semantics are covered by 23 isolated backend tests. No real paid provider order was placed. Review found and corrected delivered codes disappearing from the active list, live Pascal-case enum values, and the provider's requirement for an explicit bodyless-POST content length. Completed orders now remain visible in the main list for one hour, with permanent account history separate. Actual paid delivery, no-SMS financial outcomes and production MySQL concurrency remain acceptance items.
