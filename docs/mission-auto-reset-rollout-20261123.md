# VeInvite automatic mission reset — safe staged implementation (2026-11-23)

## Product contract (approved)
- No manual restart button. A missed N+1 allocation vote makes the uncompleted attempt expire when N+2 begins.
- The next dApp attempt belongs to **N+2**; its three distinct positive external-dApp rewards must have VeChain event blocks in [N+2 round start, N+2 round end]. Next voting round is N+3.
- If a worker runs late in N+3, it must still derive the N+2 attempt and count only N+2 dApp events. Never use the time the user reopens VeInvite as the starting block.
- The inviter, invitee, and already occupied friend slot persist. Historical events, identity, fraud evidence and completed / reserved / paid payouts remain immutable.
- When an attempt is durably reset, show **0/3** and write **one** invitee-only existing-style bell notification, in all supported locales:
  - Title KO: 미션 진행도 초기화
  - Body KO: 미션 완료 기한이 만료되어 진행도가 0/3으로 초기화되었습니다. 다시 미션을 진행해 주세요.
- No extra paid infrastructure or periodic polling service. Reuse existing onchain sync and notification history.

## Status and release order
The complete staged path now includes new proof, funding, Sybil admission,
actual vote-round-close batch, Claim, base receipt and X obligation accounting.
The isolated PostgreSQL 17 suite runs captured canonical Production functions
with fake data and proves both existing additive and withheld X policies.
It does not transmit real tokens. The separate actual app build and browser
tests must also pass.

Release in this order:
1. Apply the combined SQL transaction with the auto-reset setting OFF. Verify
   exact source fingerprints, roles, legacy accounting parity and no attempts.
2. Record the verified migration version and merge the tested app release.
   Production readiness is pinned to the reviewed Supabase project; Preview
   requires explicit opt-in and its own migrated schema. No Vercel permission
   workaround, extra cron or infrastructure is required.
3. Confirm the exact Vercel Production commit and healthy existing app.
4. Enable only the new DB switch after verification. If paused, retain
   durable attempt projections; never clear the historical ledger or funds.
5. Observe the existing cron and verify real progress/notification delivery.
   Do not mark real onchain payout tested until a genuine participant completes.

The original entry funding binding, historical evidence, invitation identities,
slots and previously reserved/paid rewards are not rewritten. The preexisting
manual retry feature remains OFF. This change uses only the canonical
settlement policy and its existing security/Claim/receipt gates.

## Required before live activation
1. Create a durable, **server-owned** attempt lifecycle. Persist an attempt at the exact
   source round (even when a sync runs in N+3), with a uniqueness constraint on
   (invite_code, dapp_round_id), serializable/advisory-lock protection and exact
   notification deduplication. Expose effective 0/3 without changing the original
   invitation or slot. Protect verified late vote proofs and Sybil / funding holds.
2. Implement attempt-bounded chain reconciliation: first 3 DISTINCT external app
   RewardDistributed positive events, after start and before dApp round end.
   Require conversion after first new dApp event, and verified AllocationVoteCast
   in N+3 after conversion. Reject old chain events and same-block out-of-order
   events. Check finality.
3. Extend canonical final eligibility, **shared pool** reward pricing/reservation,
   Sybil clearance, allocation funding / recovery offsets, and exactly-once Claim
   to use a valid attempt proof and its verified funding receipt. Do not reuse
   immutable original cohort binding or bypass current payout guard.
4. Extend existing notification kind/history, one-time recipient scope, and every
   supported locale. Reuse the existing bell animation/CSS. Refresh the invitee
   mission card, home/network/leaderboard and forecast projection from effective
   attempt state, not old invitation progress.
5. Test on a separate staging dataset and preview: N/N+1/N+2/N+3 transitions,
   delayed cron and delayed indexer, reorg/finality, concurrent workers, 0/1/2/3
   progress, original 3/3 without vote, active invitee/slot retained, security
   REVIEW/BLOCKED, two unbound legacy entries, existing paid claims, X option,
   multiple missed rounds, estimated rewards, responsive UI and RTL layouts.
6. Keep both release gates OFF until all above pass. Roll back by disabling
   the new read path and sync; never erase historical financial entries.

This protects Production while groundwork is under review.
