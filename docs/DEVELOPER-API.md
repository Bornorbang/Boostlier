# Boostlier service API

The API dashboard is `/dashboard/api`, public docs are `/developers`, and
`/openapi.json` exports the same 34 service operations.

The API covers USA Numbers, Global Numbers, Long-term Rentals, Boost Account
and Temporary Emails, including service catalogues, quotes, purchases, order
history/status, SMS/inbox messages, supported cancellations/refills and renewals.

The base URL is `{site-origin}/api/backend/api/v1`. Authenticate server-side
with `X-API-Key`. Generate, rotate and revoke keys from the signed-in dashboard;
no password confirmation is required. API keys cannot manage other keys.

Purchases use the account's existing prepaid USD wallet. Fund it in the dashboard.
Wallet/account management, deposits, rewards, ads, announcements and support are
not developer API products. Their former `/api/v1` routes return 404. Dashboard
features continue to use their existing session-authenticated routes.

The public allowlist is `backend/src/developer-routes.php`. Shared verification
routes are in `backend/public/index.php`. All service actions reuse existing
ownership, expiry, pricing, wallet, idempotency and refund checks. Long-term
rentals use their own cancellation endpoint, separate from verifications.

`src/lib/endpoints.ts` owns the documented operations and examples. Update it
alongside the backend allowlist when changing the service API.

Checks:

- `node tests/api-integration.mjs`: key lifecycle, ownership and removed routes.
- `node tests/api-all-endpoints.mjs`: every documented operation against an
  isolated SQLite database; provider credentials disabled to test errors safely.
- `node tests/api-browser.mjs`: keys, OpenAPI, documentation and mobile layout.
- Provider-specific PHP suites cover provisioning, SMS, refunds and retries
  using mock transports. No paid live order is implied by these tests.

See [API verification](API-VERIFICATION.md) for current results and limits.
