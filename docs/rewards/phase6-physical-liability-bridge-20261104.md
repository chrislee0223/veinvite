# VeInvite phase 6 — physical-pool and cohort-lifetime bridge (2026-11-04)

**Status: Draft/isolated QA, no live financial changes.**

## Authoritative Production semantics

- `read_outstanding_reward_liability` covers existing UNPAID queue reservations, legacy UNPAID payouts, and post-base LIVE X obligations. Already-PAID obligations are not part of the *physical* outstanding obligation.
- `read_reward_cohort_committed_wei` includes historical fixed reservations (including PAID) and valid recovery offsets and live X promotion commitments. PAID amounts remain in the cohort lifetime commitment. A pre-completion guarantee would need to be added **only until converted**.
- `commit_reward_reservation` checks current outstanding liability before writing a fixed reward; it does **not** consume the new hypothetical admission guarantee. Making the new ledger active without updating this RPC is unsafe.
- `automaticRewardPayout.ts` rechecks physical balance and outstanding liabilities before signing. The future global admission holds also must be counted or current payouts could consume tokens promised to future completers.
- Any X promotion hold and older-referral protection must share the same physical headroom; the historical source/boost bank is **not** free onchain money.
- Recovery offsets reduce the actual B3TR transfer while adding a cohort lifetime charge; future handoff must preserve both gross lifetime and net physically owed ledgers. The current isolated prototype fail-closes this case pending a full accounting bridge.

## New PostgreSQL 17 financial bridge tests

`reward-admission-liability-bridge-lab.sql` and `reward-admission-liability-bridge-assert.sql` add an explicit per-pool reader and a per-cohort reader to the already-running fake-schema QA. They verify:

1. After an actual finalized payout, physical tokens decrease, but cohort lifetime commitments remain spent.
2. A held admission converts to an UNPAID fixed reward one-for-one: total **physical outstanding remains unchanged**, lifetime cohort consumption is unchanged.
3. The existing final fixed payout remains signable if the full pool covers everyone, even if total free capacity is zero. A larger or unknown manifest is not authorized.
4. An additional X/older obligation can make the physical pool underfunded; signing then fails closed until genuinely additional physical tokens exist.
5. Stale evidence, unresolved older-cohort risk and anon/authenticated access fail closed.
6. Gross/net recovery offset cases do not accidentally masquerade as ordinary fixed transfers.
7. Tests run in GitHub Actions PostgreSQL 17 without Production credentials, onchain keys or transactions.

**Explicit limitation:** `check_fixed_manifest_signable` is a simulation, not a contract permission or signing authority. Existing finalized manifest, gas/pool freshness, private-key and transaction journal guards remain mandatory. PostgreSQL serializes DB state, but a third-party authorized onchain transfer could race the DB; absolute guarantees need reserved liquidity/custody or conservative collateral, not merely a counter.

## Future activation design — not yet implemented

- New prospective cohort only, closed admission window and unique invitation idempotency; retain legacy rights unchanged.
- A single source of truth for all outstanding physical liabilities and cohort lifetime commitments, including the new temporary guarantee. Every writer that allocates/rebalances funds or signs payout must use it.
- Before rollout: stage coherent migration/feature flag as **disabled**; test Production-schema SQL with real RPC definitions on an isolated Supabase/Postgres clone, including concurrency, failure recovery, old late users and X promo.
- Convert temporary guarantee atomically into fixed payout when Sybil clearance and finalized mission eligibility are proven. Do not release merely on time-out, Claim or transaction submission.
- Complete required VeInvite CI and dependency-security gate before making Draft PR mergeable.

## Current CI/security blocker

The repository's normal CI has a pre-existing `npm audit --audit-level=high` failure, including follow-redirects 1.16.1 and a transitive elliptic dependency. A patched follow-redirects 1.16.2 exists, but any security dependency update belongs in a **separate lockfile-consistent, regression-tested change**, not an unchecked override or bypass in the reward PR. The dependency resolution is not completed by this phase.

**No Production migration, RPC, payout signing, Claim, user-facing reward forecast, or live runtime flag changed.**
