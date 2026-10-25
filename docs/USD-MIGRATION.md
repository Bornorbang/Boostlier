# USD wallet and pricing

Boostlier uses USD throughout the customer dashboard, public pages, developer API, administration, wallet, funding, refunds, rewards, email and advertising flows.

| Service | Current price rule |
| --- | --- |
| USA Numbers | USD provider cost + USD 1 |
| Global Numbers | USD provider cost + USD 1 |
| Long-term Rentals | USD provider cost + USD 1.50 per purchase or extension |
| Temporary Email | USD 1 per 24-hour purchase or renewal |
| Boost Account | Converted supplier cost multiplied by 2 (100% markup) |

USD-billed provider costs use fixed 1:1 conversion. The SMM provider bills NGN; its current owner-approved conversion is NGN 1 = USD 0.001, with the 100% markup applied before final cent rounding. Unknown foreign currencies are not silently interpreted as USD. Ads retain their previous nominal fee (the local default is USD 10). Rewards retain their numeric thresholds and payouts in USD, with the previously approved percentage rules.

## Existing balances and orders

Migration `020_usd_currency.sql` preserves nominal financial amounts: a prior balance of 10.00 becomes USD 10.00, without multiplying its stored minor units. Balances, holds, captured charges, refund amounts and reward claim values remain numerically identical. Refunds continue to use the original captured charge rather than the new selling price. Price changes affect new purchases and renewals/extensions.

The migration renames financial columns from `*_pence` to `*_cents`, rewrites saved internal JSON money keys, creates the payment table with a USD default, installs current pricing and invalidates old catalogue/Global quote snapshots. Existing supplier-cost caches remain usable; selling prices are recalculated under current settings.

## API and configuration

Customer and developer contracts now use `currency: USD`, `price_usd`, `max_price_usd`, `balance_usd`, `reserved_usd`, `amount_usd`, `refund_usd`, and integer `*_cents` fields. Old request bodies with `*_gbp` keys are explicitly rejected with `CURRENCY_CHANGED`; clients must reload and confirm the USD quote before purchase. They are not accepted silently without a matching price cap.

Environment names are `MIN_TOPUP_CENTS`, `MAX_TOPUP_CENTS`, `TEMP_MAIL_PRICE_CENTS` and `ADS_PRICE_CENTS`. Pricing JSON uses `retail_margin_cents`, `wholesale_margin_cents` and `rounding_cents`. Current configuration templates and developer examples have been updated.

## Funding

Hosted checkout requests USD and verified credits must match the USD payment amount and ownership. This does not configure a new payment provider or supply missing credentials. The existing Stripe integration still needs its normal configuration before live funding can be exercised.

Historical payment rows retain `original_currency` privately. A pending non-USD checkout becomes `currency_review` and cannot automatically credit the USD wallet. Previously successful legacy callbacks are validated against their original currency and acknowledged without another credit. There were no local payment rows when this migration ran.

## Deployment and verification

Pause web writes and workers, back up the database, run all migrations, update environment/configuration names, build the frontend and restart all services. MySQL production migrations require their normal backup and DDL review; local verification used SQLite. A pre-migration local backup is retained in ignored `artifacts/pre-usd-20261022-114408.sqlite`.

The local audit verified matching totals and row counts across all 16 financial columns. Dedicated migration tests cover preserved balances/holds, exact new pricing, original-charge refunds, custom ad price preservation, legacy checkout handling, USD-only credits and replay protection. Existing wallet, number, SMM, email, ads, admin and rewards suites were migrated to USD. Read-only live Global prices were checked; no live paid number purchases or funding payments were submitted.
