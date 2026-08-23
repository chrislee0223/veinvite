# VeInvite Weekly Impact Report

This document defines the operator metrics used for weekly public updates about VeInvite's measurable contribution to VeBetterDAO.

## Reporting language

Do not claim that VeInvite literally created a wallet unless wallet creation can be proven. Public reports should say **"new wallets onboarded through VeInvite"** or **"new users/wallets activated through VeInvite"**.

Do not describe all later activity by those wallets as caused by VeInvite. Transaction metrics are intentionally conservative and count only the verified on-chain actions required by the VeInvite onboarding flow.

## Public reporting baseline

Pre-launch/test activity must not be mixed into public weekly impact posts. `operator_reporting_config.reporting_start_at` is therefore `NULL` until an explicit launch baseline is approved. While it is `NULL`, `operator_public_weekly_impact` returns no public-report rows.

When public reporting begins, set the baseline deliberately. Prefer a Monday 00:00 UTC boundary so the first public week is complete and comparable with later weeks.

Use `operator_weekly_impact` for internal operational analysis, and `operator_public_weekly_impact` for numbers intended for X or other public reporting.

## Weekly period

`operator_weekly_impact` groups data by UTC calendar week, Monday 00:00 UTC through the next Monday 00:00 UTC. This aligns cleanly with global VeBetter reporting and avoids mixing operator local time zones.

## Core metrics

- `new_wallets_onboarded`: distinct invitee wallets whose VeInvite referral was activated during the week.
- `successful_referrals_completed`: referrals whose allocation vote checkpoint was completed during the week.
- `active_onboarded_wallets`: distinct invitee wallets with a recorded qualifying onboarding transaction during the week.
- `verified_dapp_reward_transactions`: distinct transaction IDs containing the first rewarded activity from each of the first three distinct VeBetter dApps required by VeInvite.
- `verified_dapp_reward_events`: qualifying dApp reward events recorded for the first three distinct apps.
- `governance_vote_transactions`: distinct allocation governance vote transaction IDs recorded by VeInvite.
- `verified_onboarding_transactions`: distinct transaction IDs across the qualifying dApp reward and allocation-vote events. This is the safest public "transactions generated" metric.
- `paid_referral_rewards`: VeInvite referral rewards whose payout status is actually `PAID` during the week.
- `rewarded_wallets`: distinct inviter wallets actually paid during the week.
- `b3tr_distributed_wei`: exact B3TR payout total in wei.
- `b3tr_distributed`: human-readable B3TR total assuming 18 decimals.

## Why transaction counting is conservative

VeInvite records only the minimum verified on-chain onboarding actions that it directly requires: rewarded activity across the first three distinct VeBetter dApps plus the allocation governance vote. It does not count unrelated later transactions by the same wallet, so public impact claims are not inflated.

The raw events are stored in `invite_impact_events` with an idempotent `event_key`, network, invite code, wallet address, event type, transaction ID, block number, block timestamp, app ID or vote round ID, and detection timestamp.

## Operator queries

Internal weekly data:

```sql
select *
from public.operator_weekly_impact
order by week_start desc;
```

Public-report data after the launch baseline is enabled:

```sql
select *
from public.operator_public_weekly_impact
order by week_start desc;
```

Lifetime totals:

```sql
select *
from public.operator_impact_totals;
```

For a custom period, query `invitations`, `invite_impact_events`, and `reward_payouts` using the exact UTC start/end timestamps rather than approximating from current counters.

## Suggested public format

Weekly VeInvite Impact

- New wallets onboarded: X
- Successful onboarding completions: Y
- Verified VeBetter onboarding transactions: Z
- B3TR distributed to inviters: N B3TR

Optional detail:
- dApp reward transactions: A
- governance vote transactions: B

Always distinguish verified DB/on-chain facts from estimates. If event capture is incomplete for a period, say so instead of presenting an inferred transaction count as exact.
