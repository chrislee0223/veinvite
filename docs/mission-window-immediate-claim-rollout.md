# VeInvite: one-round dApps, next-round vote, immediate Claim — gated rollout

Status: **design and read-only policy helper only; NOT activated**. No Production
data modifications, no payout code changes, no extra notification types or cron.

## Four rules

1. A new attempt begins in round N. The participant must perform qualifying
   actions in at least three distinct dApps within the attempt window.
2. The vote must be proven on-chain in round N+1. Once fully verified
   (including Sybil), the inviter gets a real Claim button and payout starts
   on Claim. No waiting for the official N+1 allocation receipt/grace.
3. At round N+2, a **still-incomplete** attempt expires. It takes up **zero**
   permanent future reward capacity. The participant may start a fresh
   attempt with **new** post-restart chain events; old proof cannot be reused.
4. All already COMPLETED/ELIGIBLE/RESERVED/PAID referrals (particularly
   ACXKGKC and R4LKDJM in round 125) remain unchanged and must be
   safely given a Claim opportunity after the new payout policy is validated.

## Mandatory implementation gates before Production

- Persist new immutable per-attempt identity and start/end block positions.
  The current `invitations.activated_at`, `activation_block` and wallet
  identity are immutable; the existing `claim_invitation_with_entry_proof`
  returns `ALREADY_REFERRED` for any previously accepted wallet. Simply
  cancelling or clearing old invitation rows makes re-entry impossible.
- Teach dApp, conversion and vote scanner/eligibility authority to use
  **current attempt-only** chain events. The current scanner deliberately
  allows vote after dApp #1 followed by dApps #2/#3; new policy needs a
  future-only cutover and explicit grandfathering of existing completions.
- Introduce an attempt restart transaction that preserves original Sybil
  investigations, relationship ledgers, immutable payouts, and audit trail.
  Prevent Sybil ban circumvention; update all dependent progress/slot UI.
- Implement **atomic live completion payout pricing**. Capture the finite
  current vote-window cohort (not historical unfinished users). Reserve a
  fair portion for other still-eligible current-window participants only
  until the vote window ends. Respect immutable existing Claims, X 10 B3TR
  reserve and physical balance. Simultaneous completions must serialize.
- Finance tests: two existing eligible, one still active, another completion
  later, 100+ concurrent joins, same-wallet retries, pool exhaustion,
  mid-round top-ups/outflows, no double paid, Sybil REVIEW/BLOCKED, SQL
  operator pause, scanner lag, claim-to-payout replay/recovery.
- Update **existing** invitation and reward notifications only as needed;
  do not add a new delivery pipeline or scheduled task. Update all locales.
- Run dry-run SQL and integration tests in isolated Preview DB, compare
  financial snapshots before/after, then activate future-only via explicit
  versioned migration and verify Production receipts/Claim.

## Observed Production baseline (2026-11-17 KST)

- Unfinished accepted referrals: 24 (23 old, 1 recently accepted).
- Completed, Sybil CLEAR, awaiting reservation: 2 (round 125).
- Shared-pool v1 already treats unfinished referrals as provisional (zero
  physical liability). Cleanup is primarily **mission UX / retry eligibility**,
  not liberation of a real permanent 24-person escrow.
- No destructive cleanup or live payout activation should precede the gates.
