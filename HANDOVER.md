# Current handover - 22 October 2026

Read [Launch readiness](docs/LAUNCH-READINESS.md) first. The local build and
customer/admin/API regressions pass; public paid launch is not yet approved.

## Current product scope

- USA Numbers: TextVerified SMS verifications.
- Global Numbers: 5sim, highest-rated available operator selection.
- Long-term Rentals: TextVerified fixed-term rentals and manual extensions.
- Boost Account: social catalogue, quotes, wallet orders, statuses and refills.
- Temporary Emails: 24-hour inbox generation, reading, renewal and deletion.
- App features: wallet, ads, five-rule rewards, support, announcements,
  profile/password, admin controls and customer impersonation.
- Developer API: 34 service operations only; no app wallet/account, ads,
  rewards, support, payment or announcement endpoints. See
  [Developer API](docs/DEVELOPER-API.md).
- Dedicated Numbers is not implemented and remains marked unavailable.

All current monetary values are USD. USA/Global add $1, long-term adds $1.50,
email costs $1 per generation/renewal, and Boost converts NGN at 0.001 USD
then applies 100% markup. See [USD migration](docs/USD-MIGRATION.md).

## Open launch work

Payments and SMTP are unconfigured. Production admin credentials need hardening.
Age affirmation and versioned terms acceptance are not yet enforced/recorded.
Provision HTTPS frontend plus PHP-FPM/MySQL, supervise background workers,
verify backup restoration, and complete funded live acceptance/reconciliation.
No public deployment or Git remote is configured.

Live catalogues/quotes work. Current paid provider purchase and SMS/refill/
extension tests use mocks; do not describe them as paid live certification.
Temporary email generation/empty inbox were checked live. Email content
fixtures do not establish real incoming-message deliverability.

Use [Launch readiness](docs/LAUNCH-READINESS.md) for the full evidence and
remaining tasks, [Deployment](docs/DEPLOYMENT.md) for hosting, and the per-product
documents for provider details and failure/reconciliation behaviour.
