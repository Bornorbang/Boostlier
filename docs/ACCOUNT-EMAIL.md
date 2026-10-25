# Account email

New password and Google registrations queue a branded welcome email inside the account-creation transaction. Existing accounts do not receive retrospective welcomes. Password-reset requests return the same response for active, missing, and disabled accounts; requests are limited by address and IP.

SMTP credentials remain in `backend/.env`. The configured connection uses authenticated implicit TLS on port 465, with certificate verification enabled. `SMTP_ENCRYPTION=smtps` maps to PHPMailer's `ENCRYPTION_SMTPS`; `tls` supports STARTTLS deployments. Both HTML and plain-text email bodies are sent. `APP_URL` must be the public HTTPS frontend origin in production: email links use this configured origin, never a request Host header.

Run `php backend/bin/mail-worker.php --watch` under a process supervisor, or run `php backend/bin/mail-worker.php` every minute with cron. The existing general jobs command also drains up to three account emails per run. The dedicated mail worker avoids processing payments or support-ticket backlogs. The local worker is started separately; it does not persist across a machine restart.

The durable database queue leases work for two minutes, retries failures with exponential backoff, and retains delivery status/attempt counts without SMTP errors, passwords, or raw reset tokens. Welcome jobs expire after 24 hours; reset jobs expire after 30 minutes. Reset links receive a fresh 30-minute lifetime at each delivery attempt. A new delivery attempt invalidates prior reset links. SMTP acceptance is recorded as sent; it does not prove inbox placement. As with ordinary SMTP queues, a crash after acceptance but before recording success can cause a duplicate email on retry.

Successful resets lock the owning account, validate an unused/unexpired hashed token, replace the password, invalidate all reset tokens and pending reset emails, revoke all browser sessions, and write an audit event atomically. Developer keys remain unchanged. Disabled accounts cannot receive reset emails or reset their password. The reset UI confirms the new password, removes the token from the address bar, and provides a new-link route for invalid/expired links.

Verification: `php backend/tests/account-mail.php`, `node tests/account-mail-browser.mjs`, `npm run check`, and `npm run build`. Browser tests use an isolated database and fake mail transport; no customer email is sent.

## Seven review passes — 24 October 2026

1. Registration: welcome insertion shares the account transaction; both password and new Google accounts are connected; rollback test passes.
2. Reset security: hashed 256-bit random tokens, expiry, single use, account locking, disabled-account checks and session revocation verified. An authenticated password change also cancels outstanding reset tokens/emails.
3. Privacy: generic reset responses match for known/missing addresses; rate limits remain in place; credentials are absent from frontend source; queue contains no raw reset links; reset route uses no-referrer.
4. Delivery: authenticated TLS connection and SMTP acceptance verified; both labelled welcome/reset templates accepted by the configured server. Inbox placement remains a mailbox/provider acceptance check.
5. Recovery: failure/retry, missing SMTP, expiry, disabled account, duplicate worker delivery prevention and registration rollback covered by isolated tests. Worker logs contain no provider error details or tokens.
6. User interface: real browser exercises mismatched passwords, successful reset, token removal, invalid link state, session revocation, replay rejection and new-password login.
7. Regression and operation: 12 mail tests, 44 core regressions, TypeScript/static checks and production build pass. Migration applied after a local database backup; dedicated local worker running; production scheduling and APP_URL requirements documented.
