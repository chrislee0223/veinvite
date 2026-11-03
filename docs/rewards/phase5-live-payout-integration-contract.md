# VeInvite phase 5 — live-compatibility audit and atomic guarantee handoff (2026-11-04)

**Status: DRAFT / ISOLATED PostgreSQL QA / READ-ONLY Production.**

## Authoritative Production contracts checked

1. `commit_reward_reservation_with_late_reserve` calls the existing `commit_reward_reservation`. The latter checks the existing `read_outstanding_reward_liability(network,app)`, and a cohort commitment bound to the immutable original allocation receipt. It does not recognize any hypothetical early admission guarantee ledger.
2. `read_outstanding_reward_liability` currently accounts for unpaid fixed `reward_queue_entries`, unresolved legacy payout records, and post-base LIVE X promotion obligations. It excludes already `PAID` queue liabilities. **It does not include the draft admission hold.**
3. `read_reward_cohort_committed_wei` counts fixed queue reservations including previously PAID lifetime commitments, Sybil/recovery offsets and X promotion commitments. **It does not include the draft admission hold.**
4. `immediateClaimPayout.ts` creates a batch for existing claimed+reserved entries using `prepare_predictive_reward_batch`. A minimum admission guarantee is NOT a completed or claimed reward.
5. `automaticRewardPayout.ts` re-reads on-chain pool and the outstanding liability before signing and compares pool to immutable manifest total. **Future early holds need a distinct protected liability component**, or a current payout might spend funds promised to still-incomplete admitted users.
6. `submittedPayoutRecovery.ts` waits for canonical finalized VeChain evidence before marking actual PAID. A DB-only guarantee MUST NOT be released merely on submission/broadcast or a timeout.
7. `rewardBoostReserveExecution.ts` sweeps and releases reserve funding. The future admission ledger would need to be included in the pool/cohort capacity authority **before** enabling any live guarantees.

## Critical consequence

**Never add a live pre-guarantee table and merely call the current reward RPCs unchanged.** Two independent financial ledgers would both treat the same B3TR as available.

Also avoid simply subtracting the pre-guarantee from every existing reader. That would **double count** it once the normal immutable completion-time reservation is created. This needs a transactionally atomic handoff, ideally in the existing serialized reward-reservation RPC.

## Isolated PostgreSQL 17 prototype and test coverage

- `reward-admission-atomic-lab.sql`: global physical pool lock -> cohort -> invitation lock; unique invitation guarantee; idempotent retries; terminal Sybil/cancel release; explicit older-cohort and stale-funding fail-closed gates.
- `reward-admission-payout-handoff-lab.sql`: `HELD guarantee -> UNPAID immutable fixed reward -> PAID` state machine. A successful fixed-reservation handoff releases the original minimum exactly once **inside the same database transaction**.
- `reward-admission-payout-handoff-assert.sql`: cannot hand off without finalized mission and Sybil CLEAR; mismatched quote or receipt rejected; 5 B3TR guarantee becomes 5 B3TR outstanding fixed liability with zero overlap; higher quote rejected unless additional global and cohort funds exist; cannot mark PAID without independently stored canonical chain-finality proof; repeated handoff and settlement preserve exactly-once state.
- `Reward Admission PostgreSQL Lab` CI concurrently races different cohorts, duplicate invite requests and 20 participants competing for two reserved seats; all separate from Production DB.
- `reward-admission-live-compat-boundary.test.mjs` enforces that no provisional admission model is imported by live payout code or secretly installed as a migration.

## Required real-world integration sequence before enabling a minimum guarantee

1. Introduce a **new prospective-cohort-only** policy version, clear participation deadlines / rules and an explicit admission limit. No retroactive changes to past rounds.
2. Confirm exact official allocation receipt and immutable invite-cohort evidence, production-grade Sybil admission controls, and disjoint financial liabilities (historically paid commitments vs only **unpaid** physical claims, X promotion, old participant rights).
3. Introduce service-only, strongly permissioned idempotent admission-hold ledger with global + cohort serialized capacity authority. Create an independently auditable receipt on each hold.
4. Update ALL authoritative readers and writers in one safe staged migration: cohort commitment reader, outstanding pool liability, reserve/rebalance capacity, future admission, fixed reward reservation / late reserve wrapper, Claim fast path and payout signer. **No split rollout in which only one of these recognizes guarantees.**
5. At finalized successful mission, atomically exchange the admission minimum into the actual fixed reservation (and extra confirmed amount only if available); record quote, clearance and cohort evidence exactly once.
6. After a trusted canonical finalized on-chain transfer, mark PAID via existing durable manifest/settlement recovery. PAID decreases outstanding pool liability but remains in lifetime cohort commitment accounting. Never delete/recreate the immutable original reward history.
7. Add rollback/disable switch that stops **new** admissions without forfeiting existing held guarantees. Verify 100–1,000 concurrent requests, late Sybil reversals, X promo/boost, submitted-chain retries and cross-round races against a Production-schema isolated database.
8. Resolve the unrelated existing `npm audit --audit-level=high` CI gate failure before merging. Do not bypass the gate.

## Extra limitation: chain and database are separate systems

A PostgreSQL lock serializes local operators, not the public VeChain pool. A payment by another authorized distributor or an external on-chain change could occur after a read. A hard, unconditional guarantee would require stronger custody/escrow semantics or overcollateralized funding plus signer-level controls and fail-closed recovery; an application-only preview does **not** provide a mathematical 100% guarantee against external changes.

## Read-only Production observation at 2026-11-04 01:12 KST

- Existing unpaid base/X liability: 0 B3TR; QUEUED/unpaid payout record 0.
- Two currently activating referrals in cohort 123.
- Ordinary additional boost capacity: 0 B3TR.
- The old 27-person all-complete example remains a **hypothetical** weighted-protection stress case, not a proven actual underpayment.

**This Draft PR does not modify Production, migration history, live SQL RPCs, the payout transaction signer, or the public reward estimate.**
