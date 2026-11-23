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

## Status
This commit implements only **pure policy and tests**; it performs no runtime writes.
The 2026-11-17 manual retry foundation remains gated OFF in Production. Do not turn on
`reward_admission_bridge.mission_retry_settings_v1.enabled` or
`VEINVITE_MISSION_RETRY_READY` on the basis of this commit.
The production legacy `invitations.apps_completed` field is monotonic due to
`prevent_invitation_reconciliation_progress_regression`; DO NOT set it to zero.
A new attempt needs a separate progress projection instead.

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
