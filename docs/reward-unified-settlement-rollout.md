# Unified settlement v3 — guarded rollout (not live)

## User-approved policy
- All **actually spendable** B3TR belongs to one unified reward pool, after
  deducting **all legally committed but unpaid** core and X obligations.
- At a fixed weekly cutoff, snapshot **finally completed and Sybil CLEAR**
  referrals, with active wallet restrictions cleared. If there are none, carry
  the free balance forward, not an artificial cohort-specific earmark.
- Freeze a **single immutable total reward per eligible invitation** at that
  round's settlement. Repeated calls/claims must read that stored entitlement,
  not recompute it. Later missions join a **future** settlement, not the
  participant's original activation cohort.
- Every total over 10 B3TR splits into **base = total - 10** and **X escrow = 10**.
  A reward of 10 B3TR or less is paid fully as base, with no X offer.
- X escrow is released only after posting within the existing **24-hour offer**
  window, maintaining post for **24 hours from first verification**, and
  successfully passing final proof. Existing **15-minute submission grace**
  is preserved to handle ingestion lag. Expired/invalidated offers release the
  hold exactly once.
- Existing 80/20 fee arrangement, referral uniqueness, invite completion
  rules, finality and blocked-wallet controls remain unchanged.

## Critical accounting distinctions
- `sourceRetainedProtectionWei` and `recentCohortProtectedWei` represent
  **legacy logical reservations**; they are **not extra physical B3TR**.
  Do not increase pool on removing them.
- The existing `reward_boost_reserve_source_protections` ledger is immutable.
  Existing bank/outflow/paid journal entries must never be deleted, overwritten,
  or treated as new spendable funding. Migrate by additive release/reconciliation
  records with a proved conservation equation.
- `read_outstanding_reward_liability` may already contain X liabilities.
  Subtract the union of all unsettled obligations **once**, not twice.
- An eligible and closed user who hasn't claimed **has earned a fixed debt**,
  unlike an incomplete invitation. It is not safe to recycle that entitlement.
  Their allocated X hold remains committed until a precisely defined offer
  expiration/release; opening the offer only after base payment can delay expiry.
- Signed/on-chain-submitted transfers are irrevocable financial intent.
  Never reduce holds for these based solely on absent local receipt.

## Deployment phases and hard gates
1. **Stage 1 (this PR)**: pure, fail-closed bigint settlement arithmetic +
   deterministic test vectors. **No production write path modified**.
2. Build the **append-only settlement + per-invite entitlement ledger**.
   Enforce (network,invite_code) single entitlement and unique settlement
   per round at DB level, with transactional pool/round locking.
3. Introduce gated (default OFF) **v3 settlement, snapshot and claim** RPCs.
   Recheck cutoff finality, current Sybil assessment, wallet restrictions,
   prior paid/signed/queued status, outstanding base+X obligations and actual
   on-chain pool before committing. **Do not rely on this TS calculator alone**.
4. Migrate the X live-split and `read_reward_batch_transfer_amount_wei_v1`
   semantics from **additive-v2** to **included-in-total v3**, while
   grandfathering all old additive promises. Keep offer/proof/payout journal,
   payout locks, expiry/release, X privacy and security gates intact.
5. Reconcile old round-specific late quotes and source protections against all
   unpaid/refundable/signed obligations. Disable old reserve scheduler and
   cohort quote/reservation paths **atomically with v3 activation**, not earlier.
   Append release entries; never erase audit history.
6. Build UI forecast and receipts from the same fixed entitlement reader.
   Estimated amounts must be labeled forecasts, not promises. Once locked,
   claim and receipt amounts must match the immutable split exactly.
7. Test on isolated DB / preview: 0,1,2,1000 recipients; cutoff races;
   late completion; old 114–123 invitations; claim repeated/concurrent;
   Sybil after reservation; X posted on boundary; verified/expired/invalid
   offers; missing X proof; payout retry and chain finality; insufficient pool;
   partial on-chain payout recovery; disaster rollback.
8. Only after DB checks, CI, preview and finance reconciliation PASS:
   switch v3 on in a controlled production cutover. Delete **provably
   unreferenced** legacy calculation/scheduler code, retired RPCs and crons.
   Keep any function needed to replay, reconcile or audit prior payout proofs.

## Production snapshot before implementing
- 2026-11-04: mainnet, round 123; actual outstanding reward liability = 0.
- X promotion obligations: 7 RELEASED (0 pending).
- Legacy source-protection: ~1,685.1766 B3TR; recent cohort 122 logical
  protection: ~1,930.3439 B3TR. Combined ~3,615.5204 B3TR,
  **not an additional balance**.
- No schema/migration production change is authorized by stage 1 alone.

## Cutover invariants
1. Physical pool >= unsettled fixed base + X obligations + other protected
   on-chain payout intents.
2. Sum(splits.total) <= spendable free pool at commit.
3. Each split: base + X hold = total; one reward per legitimate referral.
4. No unsettled original-cohort late quote may coexist with a v3 entitlement.
5. A released X hold cannot become payable; a signed X payment cannot release.
6. Rollback can stop **new v3 commitments** but cannot discard committed v3
   entitlements or restart old commitment logic for the same invitation.
