# Service API verification - 22 October 2026

The current developer API contains 34 service operations: USA Numbers, Global
Numbers, Long-term Rentals, Boost Account and Temporary Emails.

All 34 operations passed authentication and dispatch checks across 38 isolated
HTTP scenarios. The 37 security checks verified key generation/rotation/revocation,
resource ownership and 404 responses for every removed app-only endpoint.
Dashboard key controls, OpenAPI export and mobile layout passed browser checks.
TypeScript/static checks and the production build passed.

Rewards, support, ads, wallet/account management, announcements and payment
endpoints are not exposed to API keys. Dashboard features retain their existing
session-authenticated routes. Tests inspect wallet effects using the test
customer session rather than a developer wallet endpoint.

## Provider verification limits

Read-only live catalogue/quote probes previously passed for all five services.
Paid provider transactions are covered by mock transport regressions, not live
purchases. This HTTP audit disables provider credentials and uses cached fixture
catalogues, so expected 503 responses verify safe error handling, not an outage.
Temporary email renewal/deletion and retry charge protection were exercised
through the HTTP API using an isolated database. No customer wallet was changed.

## Each current operation

| Method | Endpoint | Verified HTTP outcomes |
| --- | --- | --- |
| GET | `/api/v1/numbers/services` | 200 |
| GET | `/api/v1/prices` | 200, 503 PROVIDER_UNAVAILABLE |
| GET | `/api/v1/global-numbers/countries` | 200 |
| GET | `/api/v1/global-numbers/services` | 200 |
| GET | `/api/v1/global-numbers/prices` | 200 |
| GET | `/api/v1/rentals` | 200 |
| GET | `/api/v1/history` | 200 |
| GET | `/api/v1/number-rentals/catalogue` | 200 |
| GET | `/api/v1/number-rentals` | 200 |
| GET | `/api/v1/smm/catalogue` | 200 |
| GET | `/api/v1/smm/orders` | 200 |
| GET | `/api/v1/temp-mail` | 200 |
| POST | `/api/v1/numbers/quote` | 503 PROVIDER_UNAVAILABLE |
| POST | `/api/v1/rent` | 503 PROVIDER_UNAVAILABLE |
| POST | `/api/v1/status` | 200 |
| POST | `/api/v1/cancel` | 200 |
| POST | `/api/v1/finish` | 422 INVALID_PRODUCT |
| POST | `/api/v1/number-rentals/quote` | 503 PROVIDER_UNAVAILABLE |
| POST | `/api/v1/number-rentals/purchase` | 503 PROVIDER_UNAVAILABLE |
| POST | `/api/v1/number-rentals/extend` | 503 PROVIDER_UNAVAILABLE |
| POST | `/api/v1/number-rentals/status` | 503 PROVIDER_UNAVAILABLE |
| POST | `/api/v1/number-rentals/cancel` | 503 PROVIDER_UNAVAILABLE |
| GET | `/api/v1/number-rentals/messages` | 503 PROVIDER_UNAVAILABLE |
| POST | `/api/v1/number-rentals/recover` | 200 |
| POST | `/api/v1/smm/quote` | 200 |
| POST | `/api/v1/smm/purchase` | 503 PROVIDER_UNAVAILABLE |
| POST | `/api/v1/smm/status` | 200 |
| POST | `/api/v1/smm/refill-status` | 200 |
| POST | `/api/v1/smm/refill` | 200 |
| POST | `/api/v1/temp-mail/create` | 200 |
| GET | `/api/v1/temp-mail/messages` | 503 TEMP_MAIL_UNCONFIGURED, 404 NOT_FOUND |
| GET | `/api/v1/temp-mail/message` | 503 TEMP_MAIL_UNCONFIGURED |
| POST | `/api/v1/temp-mail/renew` | 200 |
| POST | `/api/v1/temp-mail/delete` | 200 |

Run `node tests/api-all-endpoints.mjs`, `node tests/api-integration.mjs` and
`node tests/api-browser.mjs` to reproduce these checks with localhost running.
The machine-readable results are in `artifacts/api-endpoint-audit.json`.
