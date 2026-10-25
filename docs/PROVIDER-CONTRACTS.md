# Provider implementation contracts

All vendor HTTP requests must remain in PHP. Credentials belong in PHP environment variables. Implement only against the owner's supplied current vendor documentation; entering keys into the example environment does not connect these placeholder adapters.

## Short-term numbers

`NumberProvider` in `backend/src/Providers.php` covers TextVerified USA verifications and 5sim Global verifications. `provider()` selects the implementation stored on the order. The developer API can purchase either product through `/api/v1/rent`; Global purchases require a current quote ID. See [Developer API](DEVELOPER-API.md) for all available products.

- `catalogue(country)` returns verified settlement `currency` plus `items` containing vendor service `id`, display `service`, integer `stock`, optional `duration_minutes`, and integer settlement `cost_minor`. Only selling-price fields pass to the browser.
- `quote(service,country,options)` returns current `currency`, `cost_minor`, `stock` and vendor-supported selection data. Validate area/carrier/specific-number/re-rental options here. Do not forward arbitrary browser JSON directly to a vendor.
- `purchase(intent,quote)` uses the durable local intent as vendor client reference/idempotency identifier when supported. Return `id`, `phone`, UTC `expires_at`. Save confirmed receipts before local activation. Any transport timeout after dispatch is ambiguous: do not retry a purchase blindly.
- `status`, `cancel`, `finish` return normalised state plus a **string** `sms_code`. A received/completed label without an actual code stays active. Financially significant cancellation/expiry requires `authoritative: true` and `no_sms_confirmed: true`.
- `findIntent(intent)` returns `authoritative: true`, and either `outcome: provisioned` with a verified receipt or `outcome: not_provisioned` only after definitive lookup. A search failure, empty transient response, timeout or outage must never become `not_provisioned`.

5sim finish is a separate global-only action. Do not copy GetAText lifecycle assumptions to 5sim. If a provider lacks authoritative intent lookup, leave uncertain intents pending and implement a documented operator receipt verification path before exposing release actions.

## Long-term/dedicated, temporary email and SMM

`ProductProvider` in `backend/src/Commerce.php` covers catalogue, quote, fulfilment, message access, deletion, lifecycle actions and intent lookup.

- Catalogue responses contain `items`: `id`, `name`, `description`, optional `category`, quantity `minimum`/`maximum`, and supported `periods` (`id`, `label`, public `price_usd`). Never fabricate durations or capability flags. Temporary-email catalogue prices use the approved inbox setting.
- `quote(product,input,resource)` verifies actual supported term/service/quantity and returns vendor currency and total `cost_minor`. SMM must return actual minimum/maximum quantities. It must calculate the **total** provider cost for the validated quantity, not an unscaled per-thousand rate.
- `fulfil(intent,operation,quote,resource)` supports purchase/renewal. Temporary-email receipts require provider `id`, valid `address` and verified UTC `expires_at`; number receipts require `id`, `phone`, `expires_at`; SMM receipts require provider `id`.
- `messages` and `message` must enforce the resource provider ID passed by the ownership-checked application. HTML mail is converted to text before browser display, with no active HTML or remote images.
- `delete` returns true only for confirmed inbox deletion. User and administrator deletion both require explicit confirmation.
- `action(providerId,action)` validates actual status/refill/cancel support and returns authoritative normalised state, optional start/remaining counts, and a final integer `refund_cents` only where actual policy and outcome entitle a wallet refund. Refunds must not exceed the preserved accepted USD price. No browser price/refund value enters this path.
- `findIntent` has the same positive/negative verification requirements as short-term orders.

Use bounded HTTPS requests, connect/total timeouts, redacted logs, safe errors and controlled retries for reads. Validate every required response field. Never expose vendor credentials, raw cost fields, tokens or private response bodies to browser code. Implement webhook authenticity verification or re-fetch authoritative state before changing finances.

## Acceptance after adapters are connected

Exercise a successful and a no-SMS rental for both sources, leading-zero codes, a provider-received/no-code state, stock/price changes, eligible and ineligible cancellation, late SMS, repeated/concurrent webhooks and polling, purchase timeout, confirmed receipt attachment, verified no-order release, and provider outage without refund. Exercise renewal success/insufficient funds/concurrent manual+job requests, failed inbox creation versus accepted-but-locally-failed provisioning, SMM min/max/partial/refill/cancel/refund outcomes and replay-safe settlement. Use vendor sandbox/test facilities where available and controlled real accounts only after owner activation.
