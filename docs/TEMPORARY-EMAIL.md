# Temporary email

`/dashboard/temp-mail` uses the existing session, USD wallet, sidebar and themes. Generation and each manual renewal cost **$1.00**, configured as `TEMP_MAIL_PRICE_CENTS=70` in `backend/.env`. The provider credential is `RAPIDAPI_TEMP_MAIL_KEY`, also in that ignored backend file. Never use a `NEXT_PUBLIC_` credential.

## Provider verification

Checked the current [RapidAPI endpoint definitions](https://rapidapi.com/Privatix/api/temp-mail) and [provider overview](https://temp-mail.org/en/api). RapidAPI's embedded endpoint definitions list these GET routes on `https://privatix-temp-mail-v1.p.rapidapi.com`:

- `/request/domains/`
- `/request/mail/id/{md5}/`
- `/request/one_mail/id/{mail_id}/`

Requests send `X-RapidAPI-Key` and `X-RapidAPI-Host` from PHP. The older overview mentions `/format/json/`; live verification found that suffix returns 404 on this RapidAPI deployment. The exact domains route returns JSON successfully, and an unused mailbox returns the recognised empty-inbox response.

Addresses are generated locally using 128 bits of randomness and an available provider domain. The mailbox identifier is the MD5 of the complete lowercase email address, as required by the provider. No remote create, renew or mailbox-delete operation exists. Boostlier sells and enforces a 24-hour **application access period**, extends the same active address locally, and revokes application access upon deletion. The provider's public-domain mailboxes are not private mail accounts.

The provider states incoming messages self-delete after **1–2 hours**. This is disclosed in the dashboard; renewal does not extend message retention. No outgoing mail, attachment retrieval or subscriptions are implemented.

## Authenticated API

The Next.js route `/api/temp-mail` proxies to PHP using the existing session cookie, origin check and no-store response policy. Supported actions:

| Method | Query | Body |
| --- | --- | --- |
| GET | `action=status` | — |
| POST | `action=create` | Optional `max_price_usd` |
| GET | `action=messages&inbox_id=ID` | — |
| GET | `action=message&inbox_id=ID&message_id=ID` | — |
| POST | `action=renew&id=ID` | Optional `max_price_usd` and `expires_at` version |
| POST | `action=delete&id=ID` | `{"confirmed":true}` |

Create and renew require an `Idempotency-Key` header. Keys are scoped to the account and bind the operation inputs. The frontend retains keys after transport failures. Renewal sends the expiry version to prevent simultaneous clicks in different tabs from buying two extensions of the same version. Server-side integer-cents pricing always controls the charge.

Generation reserves funds, fetches provider domains, then saves the inbox and captures funds atomically. A definitive domain/generation failure releases the reservation once and stores a rejected result. Concurrent replays produce one inbox and one charge. A retry can finish an interrupted pending operation. The existing `backend/bin/jobs.php` also resumes pending generation older than 60 seconds; run it using the existing scheduled-job deployment configuration.

Migration `007_temp_mail.sql` adds durable operation records and an owner/status index, reusing the existing `inboxes` table. Owner, address, provider identifier, status, initial price paid and UTC creation/expiry timestamps are stored. Renewal charges are recorded in the operation table and shared ledger. Responses omit provider identifiers and display dates through the existing Europe/London formatter.

Every message request checks ownership and active expiry before and after the provider call. A global single-message lookup is allowed only after its identifier appears in the selected mailbox's message list; a returned mailbox identifier must also match if supplied. Content is converted to plain text and React renders it as text. A provider failure never becomes an empty inbox. Deleted inboxes are hidden and inaccessible; expired inboxes remain visible but cannot be read or renewed.

## Verification

- `php backend/tests/temp-mail.php`: 21 checks for exact endpoints, charges, retry/recovery, single release, ownership, expiry, deletion, membership and text handling.
- `php backend/tests/temp-mail-concurrency.php`: eight competing create replays and eight competing renewal replays each charge once, using separate SQLite connections.
- `node tests/temp-mail-browser.mjs`: session enforcement, live provider generation and empty inbox, $1.00 charges, real create/renew replays, shared balance updates, copying, deletion confirmation/revocation, expiry, dark theme and mobile layout. Received-message and provider-error presentation use explicitly labelled browser fixtures; no live incoming email was sent.
- Existing wallet/core and SMM tests, strict TypeScript checks and the production build are retained.

Production MySQL locking and live incoming-message delivery remain deployment acceptance checks. No real payment top-up was used; browser testing funds only its specifically named local QA account.
