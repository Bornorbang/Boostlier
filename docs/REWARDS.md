# Rewards

The programme at `/dashboard/rewards` now implements the five owner-specified rules. Migration `019_reward_rules.sql` enables `rewards_v3`, superseding the former margin-capped programme. Historical claims remain auditable. There are no supplier-cost requirements, margin caps, or seven-day review hold in this version.

## Rules

| Reward | Qualification | Payout |
| --- | --- | --- |
| Monthly spending | USD 25 captured qualifying spend in a London calendar month | USD 1, once per month |
| Seven-day streak | Qualifying purchases on seven consecutive London dates | USD 0.50 per non-overlapping seven-day block |
| Rental cashback | Completed retail USA/Global dashboard number orders | 1%, claim full balance from USD 0.50 |
| Top-up bonus | Each individually verified USD deposit of at least USD 50 | 5% of the entire deposit, accumulated; no additional claim threshold |
| Referral milestones | 5 / 10 / 25 / 50 distinct friends with qualifying orders | USD 0.25 / 0.75 / 2.50 / 6.00; cumulative, once per milestone |

Monthly spending, streaks and referral qualification include completed number orders including developer API (`wholesale`) orders, completed/partial Boost Account orders, non-cancelled confirmed long-term/dedicated purchases, and successfully activated temporary email purchases/renewals. Ads, deposits, unfulfilled requests and refunded/cancelled purchases do not qualify. Deleted/expired email addresses still represent successfully delivered purchases.

Cashback uses only completed USA/Global orders with `price_tier=retail`. Long-term/dedicated, API, Boost and email purchases are excluded from cashback. Integer cents are summed before cashback rounding, preserving fractional-penny progress for subsequent earnings.

## Time and streaks

Monthly spending uses actual wallet capture timestamps within Europe/London month boundaries converted to UTC; month lengths and DST are respected. Streaks use the London date on which the qualifying order was placed. Multiple orders on a day count once. Completed seven-day blocks stay claimable; the next claim consumes the earliest unused block. Previously rewarded dates cannot be reused. Without an unlocked block, the live streak must end today or yesterday, otherwise progress is zero. Fourteen consecutive days can yield two distinct seven-day claims.

## Top-up launch date

The initial configured launch date is **21 October 2026, Europe/London**. Administrators can change it in `/admin/rewards`. Eligible deposits use immutable verified top-up ledger timestamps (successful credit time), rather than a payment row's mutable update time. The backend requires a successful USD payment, a matching actual `topup:<payment ID>` ledger credit, and at least USD 50 on that individual payment. Failed/pending payments, administrative adjustments and reward credits cannot qualify. Repeated provider callbacks cannot duplicate the credit or bonus.

## Claims and referrals

`reward_claims` retains reward type, integer amount, period/milestone and UTC timestamp. Monthly periods are `YYYY-MM`; streak periods contain their consumed start/end London dates; referral periods are `milestone:<count>`. All newly unlocked referral milestones are inserted atomically in one claim, with a single combined wallet credit. Incremental cashback/top-up claims deduct previous credits and pay the entire remaining balance. No monthly reset applies to these balances.

Wallet and account locking, unique period/milestone constraints and atomic claim/ledger/audit writes prevent duplicate or concurrent payment. An ineligible repeated request cannot credit the wallet twice. Existing cashback/top-up credits are deducted to avoid paying already-credited earnings again. Later refunds reduce future available earnings rather than silently debiting prior wallet credits.

Referral links and codes are unique per existing account; registration accepts case-insensitive codes. New Google accounts preserve attribution in server-side OAuth state. Existing accounts cannot be reassigned. Self-referrals are excluded. Registration or funding alone never qualifies a friend.

## Dashboard and administration

Five cards show progress and backend-controlled claim eligibility. Cashback and top-up cards prominently show 1% and 5%; top-up has no progress counter. Referral code/link, milestone statuses, claim history and London dates appear below. The shared wallet refreshes immediately after claims. `/dashboard/referral` redirects to `/dashboard/rewards`.

Administrators can inspect claims/customer progress and pause/resume claims, and set the top-up launch date. Pausing does not delete qualifying purchase/payment records. No separate authentication, wallet or payment provider was added. The earlier `rewards` and `rewards_v2` settings are no longer used by the active rules.

## Validation

Backend tests cover thresholds, qualification categories, API cashback exclusion, calendar/DST boundaries, streak gaps/reuse, per-deposit eligibility, launch boundaries, callback replay, incremental claims, all referral milestones, ownership and disabled/paused accounts. Concurrent claims are tested with twelve independent processes. Browser tests cover the five cards, all claim actions, wallet refresh, actual referral registration, redirect, admin settings and mobile light/dark themes. Test reward earnings are fixtures; no paid orders or real deposits are created. Live Google OAuth still requires configured credentials.
