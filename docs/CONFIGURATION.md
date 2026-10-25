# Configuration and business decisions

No starting prices, margins, settlement FX rates, minimum deposits, reward payouts or reseller package prices have been fabricated. Blank commercial settings disable their relevant purchase/claim flow.

## Environment

| Variable | Ownership and meaning |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Frontend, public canonical origin; localhost default for development |
| `BACKEND_URL` | Next.js server only; PHP origin |
| `BUSINESS_SOCIAL_LINKS`, `BUSINESS_OTHER_SERVICES`, `BUSINESS_SUPPORT_LINKS` | Next.js public content configuration: JSON arrays of real `label`/HTTPS `url` objects; empty by default |
| `APP_ENV` | PHP; `production` enables secure cookies |
| `APP_URL` | PHP; frontend origin used for redirects, mail and OAuth |
| `DB_DSN`, `DB_USER`, `DB_PASSWORD` | PHP; PDO database connection |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | PHP; hosted checkout and signature verification |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | PHP; server-side OAuth |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | PHP; transactional mail transport |
| `SUPPORT_EMAIL` | PHP; authorised business support recipient; no invented address |
| `MIN_TOPUP_CENTS` | PHP; required business minimum, unset by default |
| `MAX_TOPUP_CENTS` | PHP; configurable checkout safety ceiling, example 1,000,000 cents |
| `TEMP_MAIL_PRICE_CENTS` | PHP; required fixed USD inbox price |
| `SUPPORT_COOLDOWN_SECONDS` | PHP; default 10,800 seconds (three hours) |
| `ACTIVE_ORDER_LIMIT` | PHP; default 10 active/pending short-term orders |
| `API_REQUESTS_PER_MINUTE` | PHP; default 60 per API key |
| `GETATEXT_API_KEY`, `FIVESIM_API_KEY`, `TEMP_MAIL_API_KEY`, `SMM_API_KEY` | Reserved PHP credential names; entering values alone does not implement the deferred adapters |

Margins and FX rates use the settings table as their authoritative source. No secret values belong in the public environment example.

## Authoritative pricing settings

Use an owner-reviewed JSON file, stored privately, then run:

```text
php backend/bin/configure.php getatext_pricing <private-json-file>
```

Other supported keys: `5sim_pricing`, `long-term_pricing`, `dedicated_pricing`, `smm_pricing`, `rewards`.

Pricing object fields:

- `currency`: the **verified provider settlement currency**, not a value inferred from a provider name or endpoint.
- `fx_numerator`, `fx_denominator`: positive integers representing USD cents per provider minor unit as an exact rational. USD also needs an explicit configured rate. No automatic rate feed is assumed.
- `fx_updated_at`: UTC timestamp. Market-mode rates fail closed when over 24 hours old; public snapshots can still show a stale label. `fx_mode: "fixed"` explicitly retains an owner-approved fixed rate. SMM uses fixed 1 NGN = 0.001 USD with 100% markup; see BOOST-ACCOUNT.md.
- `retail_margin_cents`, `wholesale_margin_cents`: owner-approved fixed margins. Wholesale applies only to USA reseller requests.
- `markup_basis_points`: SMM percentage markup, using 100 basis points per 1%.
- `rounding_cents`: positive rounding increment, default 1 penny; always round upward.
- `minimum_price_cents`: optional minimum selling price, default no additional floor.

The CLI refuses negative or non-integer amount/rate fields. Public responses contain selling prices only. The adapter must provide current cost, stock, actual billing currency and supported options; pricing is recalculated before reservation. Private FX/margins are never sent in the public catalogue.

## Rewards settings

Migration `019_reward_rules.sql` enables the five requested rewards using `rewards_v3`: monthly spending, seven-day streak, 1% dashboard rental cashback, 5% qualifying top-up bonus and referral milestones. `/admin/rewards` can pause claims and configure the top-up bonus launch date (initially 2026-10-21 in Europe/London). The prior margin-capped and waiting-period rules are superseded. See [Rewards](REWARDS.md) for precise qualification, time boundaries, accounting and validation.

## Business content awaiting owner input

Production domain; legal entity/trading name; address and contact details; support/community/social URLs; related hosting/domain links; retention/deletion periods; legal cancellation and consumer policies; age/acceptable-use rules; reseller platform/package prices; approved service availability statements and any measurable homepage statistics. The homepage uses factual product attributes instead of invented numerical statistics. Policy pages label owner-review items. Optional external links are omitted until actual values are provided.
