# VeInvite 5-level rewards: consensus FINAL and both review flows
Updated 2026-11-19. **Preview-only, all financial routes blocked.**

Draft PR: https://github.com/chrislee0223/veinvite/pull/1350

## Scope of this development pass

1. `multilevelFinalityGate.ts` and the chain reader now require the VeChainThor SDK's **official FINAL block** to cover both activity and voting rounds. A 24-block interval is still a maturity buffer, but it **is not sufficient proof of FINAL consensus**. The new public-mainnet read-only CI smoke calls `ThorClient.blocks.getFinalBlockCompressed()` and checks actual round boundaries. Official docs: https://docs.vechain.org/developer-resources/sdks-and-providers/sdk/thor-client
2. `multilevelCandidateReconciliation.ts` rechecks FINAL status from its observed chain scan before permitting even a structurally valid **nonpayable review candidate**. A moving FINAL tip does not modify immutable source fingerprints: the finality gate is checked on each request, while only stable historical receipt/round details are hashed.
3. `multilevelOnboardingReconciliation.ts` is the NEW onboarding counterpart to the prior ACTIVE-member review. **A user does not need reward_status=PAID before receiving an initial incentive**; instead check first-ever successful onboarding, 3 distinct paid external dApps in round R, verified B3TR→VOT3 conversion after the first reward, a positive-weight vote in R+1 after conversion, valid original inviter and activation block, latest CLEAR Sybil assessment, no active invalidation/restriction, and FINAL consensus coverage.
4. **Original direct inviter is bound** to the level-1 chain. An after-completion reparent cannot redirect already earned credit; a before-completion different sponsor is not silently accepted. Neither ACTIVE nor ONBOARDING review creates monetary entitlements.
5. Reuse `public.multilevel_preview_record_review_packet_v1` for both review kinds (one RPC instead of parallel legacy/new APIs). Preview SQL overlay: `20261119_multilevel_review_accept_new_onboarding_preview_v1.sql`, applied **only** to `bpppslplhmppxzvdkwxs`. Its `service_role`-only function continues to insert immutable records into `candidate_review_packets` with `payable=false`; it cannot write to `verified_events`, `entitlements` or `claim_legs`. The old ACTIVE kind continues to work. An absent source, absent inviter, empty direct ancestor chain, mismatched inviter, cross-kind use, and repeated conflicting snapshot are all rejected.
6. `multilevelReviewFreshness.ts` provides a final **review freshness** test: if newly fetched current Sybil status/revision, wallet, round, actual chain evidence or effective-time ancestor list differs from the earlier review, stop and require a new check. It always returns `payable:false`; this is still not financial authority.

## Test coverage

- `tests/reward-multilevel-finality-gate.test.mjs`: 24+ best-block depth while FINAL is behind must reject.
- `tests/reward-multilevel-onboarding-reconciliation.test.mjs`: genuine new-user structural flow vs second onboarding, invalid Sybil, absent conversion, wrong next-round vote, original sponsor mismatch, late reparent, moving FINAL tip.
- `tests/reward-multilevel-review-freshness.test.mjs`: stale Sybil revision, historical link change, missing/fake review.
- `tests/reward-multilevel-live-chain-smoke.test.mjs`: public mainnet SDK FINAL-revision smoke (no users' wallets, no transfers).
- `docs/staged-sql/20261119_multilevel_both_review_types_fixture_test.sql`: **successfully executed in Preview**, transaction ROLLBACK. Both kinds stored, replay idempotent, wrong mission kind/inviter and null source/inviter rejected; original finance tables stay empty.

## Remaining non-negotiable production blockers

- These reviews are still structurally checked **candidates**, not independently approved payouts. Full canonical mainnet user-by-user first-onboarding history and complete immutable invitation graph have **not** been connected to Preview.
- Need trusted, signed and auditable evidence of chain finality, historical referral ownership, independent active-wallet rewards + vote, and a fresh Sybil clearance with invalidation at **settlement time** before promotion. Current helper inputs are NOT themselves authenticated proofs.
- Real settlement funding provenance, atomic eligibility promotion, Claim/X expiry and reconciliation, UI/notifications, rollback/backup rehearsal, and formal VeBetterDAO Fair Use compliance review remain unimplemented.
- Do **not** apply SQL to Production Supabase `upfjvkidaqtnbmmnhupz`, merge PR #1350, enable Vercel flags or initiate B3TR transfers without the operator's explicit final go-live approval.
