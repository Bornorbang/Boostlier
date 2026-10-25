# Boostlier administration

Open `/admin` while signed in as an active administrator. Register a normal account first, then grant the initial role from an authorised host shell using `php backend/bin/admin.php registered-email@example.com`. There is no default administrator password or public account-promotion endpoint. Existing administrators can change another account's role through Users.

## Pages and actions

| Page | Management |
| --- | --- |
| Overview | Cross-feature counts, active services, pending operations, support, verified top-ups, net service charges, wallet balances/reserves and recent activity |
| Users | Search all customers; inspect wallet, recent ledger and service counts; enable/disable accounts; change roles; credit/debit wallets with reasons and stable retry keys |
| Numbers | Inspect all customer verifications, including cancelled/expired history and saved SMS; refresh status or attempt eligible cancellation through the existing provider adapter |
| Boost socials | Inspect services, target, quantity, provider progress and refills; refresh status, request supported refills and check refill status |
| Temporary emails | Inspect inbox ownership/expiry; view message lists and individual plain-text messages; add a complimentary 24-hour support extension to an active inbox; delete/revoke access |
| Ads | Inspect all placements and private banners; edit title/public destination; remove a placement without a refund |
| Payments | Inspect provider references/status and request provider verification; successful payments cannot be credited twice |
| Wallet activity | Search/filter all ledger entries and inspect balances, reserves and references |
| Pending operations | Recover pending social/commerce, number and temporary-email operations using the existing reconciliation mechanisms |
| Support | Inspect requests, download private receipts, and update request status with an operator note |
| Rewards | Existing reward claims and customer reward-progress inspection |
| Announcements / Updates | Existing create/edit/delete controls |
| Pricing & settings | USD-to-USD number FX and flat margin, NGN-to-USD social FX and percentage markup, temporary email price and ad placement price; configuration presence only for provider credentials |
| Audit log | Search/filter operator actions, outcomes, reasons and record inspections |

Lists are paginated, searchable and support status/customer filters where applicable. Dates display in Europe/London. Financial values are USD. The admin sidebar contains implemented services; legacy long-term/dedicated routes remain available for old records but are not presented as newly integrated services.

## Security and settlement

All routes require an authenticated, active administrator on the backend. UI hiding is not the permission boundary. Customer data is selected explicitly; password hashes, session tokens, API secrets, request hashes and raw credential configuration are excluded. Disabling a customer revokes sessions, and administrators cannot disable or demote themselves. Changes, attempts and relevant inspections are audited.

Wallet adjustments use exact cents, wallet locks, unique operation references and input-conflict checks on retries. Insufficient available funds block debits. Service actions reuse the customer feature implementations: no fabricated provider status, cancellation, payment credit or refund is introduced. Provider failures remain errors; uncertain provisioning follows existing recovery rules. Complimentary inbox extensions are explicitly labelled and audited with no wallet charge.

Pricing is stored in the existing settings table, calculated server-side and applied to future purchases/renewals. Existing orders and charges remain unchanged. Provider keys remain in the private backend environment. MySQL deployment and live provider/payment acceptance checks still apply as described in DEPLOYMENT.md and individual feature docs.

## Verification

- `php backend/tests/admin.php`: 20 isolated checks covering access control, all feature lists, sensitive field exclusions, filtering, wallet retries/conflicts, insufficient funds, account session revocation, self-lockout, ad/inbox management, expiry filters, payment/support actions, recovery queues, settings and audit/overview figures.
- `node tests/admin-browser.mjs`: isolated SQLite fixture plus a temporary PHP server; exercises real administrator/customer/anonymous HTTP permissions, overview, customer wallet adjustments, number status, refill controls, inbox extension, ad editing, pricing, audit, mobile layout and customer UI denial. No live provider purchase is made and the development database is not used.
- Production Next build, TypeScript/source checks, and the existing 42 core, 14 ads, 21 temporary-email, 22 SMM and 28 TextVerified backend tests pass.

Browser screenshots are written to ignored `artifacts/admin-overview.png`, `artifacts/admin-customer.png` and `artifacts/admin-mobile.png`.


## Table filters and user row actions

Wallet activity supports exact Kind and credit/debit filters. Other lists offer Role, provider, service, issue type, product or audit action filters where relevant. Every managed table supports an inclusive London-calendar date range, validated server-side sorting and ascending/descending order. Filters and sorting apply to the full dataset before pagination; Reset filters restores defaults. Money sorts numerically. Only selected public column names are accepted for sorting.

The last column on Users contains Login, Wallet, Edit, Make Admin (for customers), and Lock/Unlock. Wallet opens the adjustment modal directly. Edit includes name, email, optional password, status and role. Promotion requires a UI confirmation, while backend authorisation and self-lockout protection apply to every request. Lock disables the account and revokes its sessions. New wallet reservations, purchases and renewals also check active account status under a transaction lock; existing captures, releases and refunds remain settleable.

Login opens a temporary customer session without requiring or revealing the customer's password. It is limited to active customer accounts, lasts at most one hour, and links to the originating administrator session. A visible banner restores the administrator account, including when the customer session is revoked while open. Customer sessions cannot access administrator endpoints, even if the customer's role is later promoted. Revoking or expiring the parent administrator session invalidates linked sessions. Logging out clears both contexts. Start/stop events and customer operations with existing audit coverage record the administrator identity. Migration 011 adds session linkage fields; original session credentials stay in HttpOnly, SameSite cookies.

The isolated browser suite verifies Kind/direction sorting, direct Wallet/Edit actions, customer login and return, lock during impersonation, unlock, promotion and parent-session revocation. It never modifies real customer accounts or the main development database.


## Simplified Users table

Users shows only User (name with registration date underneath), Email and the Login, Wallet, Edit, Make Admin and View actions. Make Admin stays disabled for existing administrators. Wallet opens only the wallet-adjustment form and Edit opens only the account-edit form. Full account identifiers, referral details, wallet data, service counts and recent ledger entries are restricted to the read-only View modal. Account locking/unlocking remains available through Edit > Account status.


## Display refinements

Admin action dialogs are centered in the viewport. User registration subtitles show only the London calendar date. Reason/operator-note inputs are removed from action modals; actions still submit an automatic description for the existing audit trail. Boost socials omits the Service, Sort by and Sort order controls. Reset filters uses the primary colour, a compact width and alignment with the input controls.

Migration 012 adds persistent numeric administrator display identifiers. The read-only account/record details show stable numbers for local identifiers; Customer ID filters also accept those numbers. Existing internal relationships and provider-issued identifiers remain intact. Numeric IDs are allocated under a locked sequence and protected by uniqueness constraints. The browser suite checks centered geometry, date-only subtitles, hidden note/service/sort fields, numeric account details and the working forms.


All admin pages now omit the Sort by and Sort order controls and use the default newest-first ordering. Reset filters uses a compact intrinsic width and an explicit Boostlier green background in both themes.


The Users page also omits From date and Until date. Wallet adjustment inputs accept whole US dollars or one/two decimal places (for example 5, 5.5, 5.50), normalize them to exact two-decimal strings before submission, and show a clear inline error for excess precision. The backend continues validating exact USD amounts and positive adjustment limits.

## Dashboard scrolling notice

Manage the dashboard marquee in `/admin/announcements` using **Dashboard notice
text** and **Save dashboard notice**. Plain text only, up to 1,000 characters;
leaving it blank hides the marquee. Settings are stored in the existing
`settings` table and saves are audited. No migration is required.

The active customer dashboard reads `/dashboard-notice` on load, window focus
and once per minute. It scrolls right to left continuously alongside the greeting, on a green
background with black text. There is no pause control. Reduced motion displays static text. This replaces
the former dashboard subtitle; the header wallet button is removed. API keys
cannot access this app-only endpoint or the admin editor.

Checks: `php backend/tests/dashboard-notice.php` and
`node tests/dashboard-notice-browser.mjs`.
