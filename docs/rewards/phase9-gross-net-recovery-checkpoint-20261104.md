# Phase 9 — gross/net recovery handoff: test-only completion checkpoint (2026-11-04)

**Draft / isolated laboratory only. No new Production function, token transfer, guarantee, Claim integration, or X payment change.**

## Verified design invariants
- Future admitted guarantee is a **gross minimum commitment** on the immutable funding receipt. It must never exceed actual provably available B3TR; the current application wallet/onchain balance observation is not independently escrowed and must not be presented as an unconditional guarantee.
- Under a vetted recovery obligation, gross final reward **G**, verified recovery offset **O**, and actual onchain payable **N** obey `G = O + N`. The cohort's lifetime budget consumes **G**; the physical pool owes **N**.
- On a single transactionally serialized handoff, consume one existing held floor **F** and create at most one net fixed-payment obligation **N**. Physical liability changes by `N-F`; lifetime cohort commitment changes by `G-F`. Never subtract `O` from both ledgers or count X post-base HELD twice.
- If **O = G**, the fully offset reward consumes the gross lifetime commitment but creates **no fake onchain payment**, queue, or signed manifest. The actual Production recovery notification/slot release semantics still require integration.
- Never release a held amount on timeout, submission or a Sybil review in progress. Terminality and actual onchain settlement require separately verified evidence. The new prototype never returns authorization to pay or promise.
- Replay, bad receipt proof, pending Sybil decision, stale balance, overfunded quoted payout, and unreconciled older debts fail closed. Both physical capacity and cohort lifetime budget must remain funded before/after substitution.

## Proof already in tests
- Pure TypeScript quote model: full/partial/zero offset, X liability counted once, 1–1,000 varied quotes, two ledgers, old-risk fail closed, no importing into live routes.
- PostgreSQL 17 fake proof and locked writer: partial offset held-to-net-fixed-to-canonical-PAID, full offset without a payout, refusal of unfunded higher quote until *both* fake physical and cohort budgets are increased, bad Sybil/receipt/attestation refusal, replay protection and no public SQL privileges.
- All these are **fixtures**, not authoritative Production funding credentials.

## Remaining real release blockers
1. A full Production-schema **isolated** clone with actual `commit_reward_reservation_with_late_reserve` / `commit_reward_reservation`, X promotion writer, existing recovery ledger, sweeps, signer, Claim and finality recovery, not merely fake SQL functions.
2. A unified pool/cohort lock and a single physical ledger across ALL base/X/legacy/future writer paths. No independent additive reservation RPC.
3. Actual trusted current onchain balance/custody and older incomplete user liability coverage; a 5-minute observation and advisory locks cannot stop an external onchain withdrawal.
4. Feature policy for **future cohorts only**, with clear claim conditions and no retrospective change to existing participants. Genuine Sybil and recovery proof must be checked in the same trusted transaction; no client-provided quote authority.
5. End-to-end QA including kill switch that blocks *new* guarantee admissions without deleting outstanding liabilities; onchain finalized PAID reconciliation; protected X 10 B3TR LIVE actions; load/retry and error recovery.
6. ALL required CI green on exact final SHA, then staged production candidate, independent approval before any financially consequential activation. **Do not merge current #1257 draft or enable the Production `reward_admission_bridge` feature.**

## Current actual Production staging status
- Version `20261103173955 reward_admission_staged_read_bridge` only.
- In cohort 123, receipt 10, reported budget was `1469.280125541217311130` B3TR; 0 existing HELD admission, 0 outstanding base/X liability at inspection. The private writer is not deployed and `enabled=false` is constrained by SQL.
- These figures alone **do not** establish free liquidity or sufficient funding for a floor or eventual bonus.
