# VeInvite Operator Data Guide

This document defines the operator-facing data surfaces used to answer questions about suspicious referrals, wallet history, referral performance, and reward history.

## Environment rule

- Production Supabase project: `upfjvkidaqtnbmmnhupz`
- Preview Supabase project: `bpppslplhmppxzvdkwxs`
- Use Preview for development/testing.
- Use Production only for live-user/operator questions.
- Never mix Preview test data into Production reporting.

## Sybil state on invitations

Each invitation has an internal Sybil decision. These fields are server/operator-only and are not returned in the normal public invite record.

- `sybil_status`: `NOT_CHECKED | CLEAR | REVIEW | BLOCKED`
- `sybil_risk_level`: `NONE | LOW | MEDIUM | HIGH`
- `sybil_risk_score`: reserved numeric score from 0 to 100; `0` can mean no calibrated score is in use.
- `sybil_reason`: current reason for REVIEW/BLOCKED.
- `sybil_checked_at`: when the current decision was made.
- `sybil_source`: `SYSTEM | VEPASSPORT | ONCHAIN | OPERATOR`

A referral can become reward-eligible only when the mission evidence is complete and a fresh post-vote Sybil decision is `CLEAR`. `REVIEW` and `NOT_CHECKED` remain pending. `BLOCKED` is forfeited unless already paid; paid settlement history is immutable.

## Audit history

`sybil_review_events` is the append-only decision history generated whenever a Sybil decision changes or is refreshed. It records the invite code, subject wallet, resulting status, risk level, score, source, signal code, summary, details, and timestamp.

Do not use a weak signal by itself as proof of abuse. Shared funding, shared networks, family activity, or later transfers to the same wallet can be legitimate. The system is designed to preserve ambiguous cases for review instead of automatically banning them.

## Operator views

For normal leaderboard questions, prefer the authenticated
`/api/admin/analytics` endpoint. It defaults to one VeBetterDAO round and
supports `scope=cumulative` for all-time totals. The service-role-only database
functions are:

- `get_operator_round_overview`
- `get_operator_round_inviter_analytics`
- `get_operator_round_reward_recipients`
- `get_operator_round_dapp_rewards`
- the matching `get_operator_cumulative_*` functions

The older global views remain internal compatibility surfaces. Verified
completion excludes legacy rows that only contain a historical `COMPLETED`
label without raw-chain proof.

## Official NEW/RETURNING growth reports

Public growth reporting is disabled until the operator locks one exact
VeBetterDAO round as the launch baseline. The lock is one-way: the network,
round, timestamp, operator wallet, and lock time cannot later be moved to add
or remove historical activity.

- `get_operator_new_user_growth`: internal funnel, including pre-launch data.
- `get_operator_public_new_user_growth`: baseline-scoped public metrics.
- `operator_round_growth_report_snapshots`: append-only versions for completed rounds.
- `operator_latest_round_growth_report_snapshots`: latest version per round.
- `/api/admin/reports/growth-round`: operator-authenticated baseline, finalization, snapshot, and revision API.

Official NEW and RETURNING counts use only wallets that completed all three
dApps, B3TR→VOT3 conversion, the later Allocation Vote, and Sybil `CLEAR`.
Verified entry counts remain internal funnel metrics and must not be described
as completed public users.

The daily reconciliation worker finalizes missing completed rounds and checks
existing snapshots again. Identical metrics reuse the existing snapshot.
Late chain evidence creates a new version with
`AUTOMATED_POST_RECONCILIATION`; it never overwrites the number previously
published. Production remains fail-closed until the first official baseline
round is explicitly approved.

### Current suspicious referrals

```sql
select *
from public.operator_sybil_watchlist
order by sybil_risk_level desc, sybil_risk_score desc, updated_at desc;
```

Use this for questions such as:
- "Are there any suspicious wallets right now?"
- "Show me wallets under review."
- "Which referrals are blocked?"

### Reward leaderboard

```sql
select *
from public.operator_reward_leaderboard
order by total_reward_wei desc, paid_referral_count desc;
```

Only `PAID` payouts count as rewards actually received. Pending/failed/sending payouts are not included in the received-total ranking.

### Referral leaderboard

```sql
select *
from public.operator_referral_leaderboard
order by completed_referrals desc, invitations_created desc;
```

Use this for questions such as:
- "Who has completed the most referrals?"
- "Which wallet has created the most invites?"
- "Which inviter has the most flagged referrals?"

## Operator Sybil decisions

Use the service-role-only `set_invitation_sybil_decision` function instead of manually changing several invitation fields. It keeps invite status and reward status consistent and the audit trigger records the decision automatically.

Put a referral under review:

```sql
select * from public.set_invitation_sybil_decision(
  '<invite_code>',
  'REVIEW',
  'MEDIUM',
  '<reason>',
  0
);
```

Clear a referral after review:

```sql
select * from public.set_invitation_sybil_decision(
  '<invite_code>',
  'CLEAR',
  'NONE',
  '<optional note>',
  0
);
```

Confirm abuse and block the referral from rewards:

```sql
select * from public.set_invitation_sybil_decision(
  '<invite_code>',
  'BLOCKED',
  'HIGH',
  '<confirmed reason>',
  0
);
```

A CLEAR decision only returns the invite to `COMPLETED` when all mission and vote evidence is already valid. Otherwise it returns to `ACTIVATING`. BLOCKED never changes an already-paid payout; paid settlement history remains immutable.

## Wallet-specific investigation

For a specific wallet, inspect all three areas instead of drawing conclusions from one table:

```sql
select *
from public.invitations
where inviter_wallet = '<wallet>'
   or invitee_wallet = '<wallet>'
order by created_at desc;

select *
from public.reward_payouts
where recipient_wallet = '<wallet>'
order by created_at desc;

select *
from public.sybil_review_events
where wallet_address = '<wallet>'
order by created_at desc;
```

When reporting to the operator, clearly distinguish:
- confirmed facts from the database,
- suspicious signals,
- and conclusions that still require review.

Never describe a wallet as Sybil/abusive solely because it shares a funding source or transfers assets to another wallet.

General B3TR transfers between wallets are not currently indexed. A future
consolidation report must label many-to-one transfers as a review signal, not
automatic proof, and should combine timing, referral relationships, mission
history, and repeated destination patterns.
