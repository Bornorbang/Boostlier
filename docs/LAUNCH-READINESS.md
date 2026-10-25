# Launch readiness - 22 October 2026

**Decision: the application works locally, but is not ready for a public paid launch.**
A staging deployment is the next acceptance environment, not evidence of completed
production setup. Nothing was deployed by this review.

## Verified

- Production frontend build and TypeScript/static checks pass.
- 247 PHP regression checks pass across wallet/payments, providers, admin,
  social orders, email, ads, rewards and USD migration.
- Six real concurrent-process scenarios pass: overspending prevention,
  duplicate purchase capture, reward claims, number refunds, email creation
  and email renewal.
- 16 running-application HTTP checks pass, including authentication, profile,
  API rotation, cross-origin writes, support MIME/cooldown, live USA quotes,
  protected routes and real 404 responses.
- All 14 feature browser suites pass after updating stale test expectations.
  They cover homepage/mobile/themes, positioning, account menus, USA Numbers,
  Global Numbers, long-term rentals, temporary email, ads, rewards, social
  promotion, favourites, number history, admin and developer API.
- A separate sweep renders 51 main public/customer/admin pages across 102
  desktop/mobile viewport checks, with no page overflow or runtime errors.
- All 34 service API operations pass authentication/dispatch checks across
  38 isolated HTTP scenarios; 37 API security/key checks pass.
- Production JavaScript dependencies: zero known advisories from npm audit.
  Composer audit: no advisories or abandoned dependencies reported.

These results do not mean a penetration test or all possible edge cases have
been completed. Browser purchases for paid number/provider orders are fixtures.
Temporary-email generation and empty inbox retrieval were checked live; incoming
message content/errors are covered by fixtures. No real payment was collected.

## Must finish before accepting public payments

| Priority | Remaining work | Evidence / acceptance condition |
| --- | --- | --- |
| 1 | Production payment acceptance | Updated 24 October: Stripe test-mode funding is fully configured, including real sandbox hosted payment, signed CLI webhook and exactly-once isolated USD wallet credit. Flutterwave integration remains available but lacks credentials. Live Stripe keys, hosted HTTPS webhook/signing secret, enabled merchant methods, production settlement and controlled live acceptance remain before public payments. |
| 2 | Production email acceptance | Updated 24 October: authenticated SMTP on port 465, welcome/reset queue and password-reset flow implemented; SMTP accepted support-mailbox test. Local mail worker running. Set production APP_URL, supervise mail worker, verify inbox placement and sender-domain authentication. Support-ticket backlog was deliberately not drained by this task. |
| 3 | Secure the production admin account | One active local admin password is identical to its email. Replace it before launch, invalidate old sessions and use separately controlled production credentials. Do not copy QA accounts/keys into production. Rotate shared provider credentials for production. |
| 4 | Implement age and agreement records | Terms say 18+, but signup has no age affirmation and no stored accepted terms version. Add backend-enforced onboarding acceptance and record the relevant version/time; cover any future Google signup too. Obtain/record any required immediate-service consent separately from funding. |
| 5 | Provision production infrastructure | Current backend is APP_ENV=development, APP_URL=localhost and SQLite. Configure the canonical HTTPS origin, frontend hosting, private PHP-FPM backend, MySQL, production secrets, secure cookies, upload storage and restricted web roots. Test migrations and locking on the real database. |
| 6 | Operate background jobs reliably | No running number sync/expiry/price worker was detected. The last recorded general jobs run is 17 October. Install supervised workers/scheduling, logs/alerts and recovery procedures so closed-browser orders, refunds, SMM statuses and support queues keep moving. Four of 2,347 USA catalogue services currently have pending prices; keep the price warmer running and handle unavailable prices clearly. |
| 7 | Complete controlled live acceptance | Verify a real USA and Global allocation/SMS, eligible cancellation and exact refund; long-term allocation/SMS/extension; paid Boost delivery and eligible refill; incoming temporary email. Exercise uncertain-response recovery without a replacement charge. Reconcile supplier outcome, local order and wallet ledger. |
| 8 | Backups, restore and final policy review | Run a database/attachment restore exercise and verify balances, reservations and ledger references. Finalise privacy retention and make sure published policies match actual signup, purchase and cancellation flows. Only the business identifiers supplied by the owner are published. |

## Product cleanup

Dedicated Numbers is still an unimplemented product and is linked publicly.
It is explicitly unavailable and cannot be purchased. Hide its marketing links
for an initial five-service launch, or implement and accept the integration.
Google sign-in is also unconfigured; it is optional and its button is hidden.
Email/password login itself passes.

During this review, stale public copy was corrected: US dollars instead of
pounds, manual rental extensions instead of automatic renewal, connected
long-term/email services instead of blanket unavailable messages, broader
service API copy, and TextVerified instead of the old provider name.
Outdated tests expecting the removed reseller page, six API routes or no USA
search field were brought into line with the current requested behaviour.

## Push versus launch

This workspace is not currently a Git repository and has no configured Git
remote. A source-code push still needs repository setup. Deployment also needs
the separate PHP/database/jobs environment; a frontend-only Vercel deployment
will not provide those services.

## Evidence

- `artifacts/site-readiness-browser.json`: page/viewport results.
- `artifacts/readiness-*.log`: feature browser outputs.
- `artifacts/api-endpoint-audit.json`: current service API route outcomes.
- `docs/API-VERIFICATION.md`: API coverage and testing limits.
- `docs/DEPLOYMENT.md`: infrastructure and operational commands.

All fixture audits use disposable databases or local QA accounts. They do not
establish production MySQL behaviour, real payment success, external delivery
reliability, SMTP deliverability or legal enforceability.
