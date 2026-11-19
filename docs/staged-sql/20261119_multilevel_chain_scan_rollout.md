# VeInvite multilevel chain scan → preview candidate DB (NOT LIVE)

**Operator rollout status:** preview-only code added 2026-11-19. No live production activation, payout, cron or user API.

## Explicitly non-runtime scaffolding

The following source files are intentionally **not reachable from production routes**. The project's cleanup audit should retain them as planned, independently tested preview components:

- `src/lib/rewards/multilevelChainLogProof.ts`: validate Thor event topics, proper B3TR amount > 0, legitimate wallet/round and ABI-encoded positive-weight allocation votes
- `src/lib/rewards/multilevelChainEvidenceReader.ts`: read-only bounded Thor scan using reviewed VeBetter network addresses and closed round boundaries; catches zero-B3TR, VeInvite self-rewards and other-round votes
- `src/lib/rewards/multilevelEvidenceWindow.ts`: onboarding R (3 apps) → vote R+1, active legacy onboarded wallets (1 rewarded app + any dApp vote in same round)
- `src/lib/rewards/multilevelPreviewObservationBridge.ts`: disabled-by-default **server-only** candidate ingestion. This file imports the reader and writes only after exact Preview environment checks; no route or cron calls it.

## Environment guard — all mandatory

- `VERCEL_ENV=preview`
- `NEXT_PUBLIC_SUPABASE_URL=https://bpppslplhmppxzvdkwxs.supabase.co`
- `VECHAIN_NETWORK=testnet` (or `testnet-staging`)
- `VEINVITE_MULTILEVEL_PREVIEW_OBSERVATION_ENABLED=true` **only for a controlled preview operator test**, no production setting

Code refuses direct ingestion for any other environment. The server-only function takes `firstOnboardedRoundId` from a previously confirmed source; it **does not infer this fact from a dApp reward event**. Until a separate provenance and Sybil gate is implemented, all rows remain **non-authoritative observations**.

## Database — preview project only

The 5th script `docs/staged-sql/20261119_multilevel_chain_observation_bridge_preview_v1.sql` creates `veinvite_multilevel_staging.candidate_chain_observations` (9th private table) and a preview-only service-role RPC `public.multilevel_preview_record_chain_observation_v1`:

- `anon` / `authenticated` have **NO execute privileges** and no private schema access
- the function only accepts testnet/testnet-staging and the inactive policy `STAGING_ONLY`
- stage is idempotent; conflicting replacement snapshots fail
- never inserts `verified_events`, `entitlements`, `claim_legs`, `return_ledger` or sends B3TR
- first onboarding cannot be obtained merely by claiming a completion round, and neither receipt ownership nor Sybil is proved by this staging RPC
- official chain finality proof **still requires an independent approval checkpoint**: a 24-block depth is only preliminary maturity, not cryptographic finality

## Tests performed

1. `tests/reward-multilevel-chain-logs.test.mjs` tests weighted allocation vote ABI, signature, wallet, round, block, positive reward and VeInvite exclusion.
2. Preview SQL was applied **only to `bpppslplhmppxzvdkwxs`** and tested in a transaction that was fully ROLLED BACK. Replayed identical observations accepted as `ALREADY_RECORDED`, conflicting replacements and mainnet rejected; no mock observation became a payable entitlement.
3. Preview function privilege check: `anon` no, `authenticated` no, `service_role` yes. Production DB has **zero** `veinvite_multilevel_staging` tables.

## 2026-11-19 additional read-only integration and legacy safety review

- `src/lib/rewards/multilevelLegacyEligibility.ts`: **NEVER** treat `invitations.status='COMPLETED'` / `reward_status='PAID'` as sufficient proof of active-network eligibility. The historical Sybil assessment must currently be CLEAR, no active invalidation, no active wallet restriction, identity link cleared, and all 3 rewarded dApps, VOT3 and vote milestones intact. The prior onboarding round must be strictly before activity round.
- `src/lib/rewards/multilevelLegacyEligibilityReader.ts`: intentionally **unreachable from production routes**; preview-server-only, secret-backed but read-only adapter for the canonical legacy and Sybil tables. Preview DB may be empty; absence is failure, not inferred eligibility.
- Live **read-only** public mainnet smoke in branch-only CI (2026-11-19, GitHub run 44476538450): scanned one completed round from official Thor contracts, decoded **88 positive external dApp reward** and **100 positive-weight vote** log events; no participant data or entitlements written. This confirms raw mainnet ABI compatibility, not user-level financial eligibility.
- `multilevelEvidenceWindow.ts` and `multilevelChainEvidenceReader.ts` now fail closed on **missing B3TR→VOT3 conversion**, conversion before first rewarded dApp, a vote before conversion, or missing immutable invitation activation block. The scanner reuses the existing 2-sided B3TR debit/VOT3 mint verifier and exact chain execution-order proof.
- Production **read-only aggregate** found 48 legacy invitations marked completed, including 27 with active historical Sybil invalidations. Filtering invalidations, latest CLEAR assessments and active wallet restrictions leaves 21 currently structurally verifiable completed records. **This is an eligibility review candidate count, NOT newly payable recipients**. No old rewards are recalculated.
- **Note**: Historical onboarding eligibility for future active-network events must never include previously invalidated PAID referrals. The legacy reader needs future controlled, provenance-verified E2E tests against a safe data fixture; no production wallet details are stored in this repository.

## NOT DONE / launch blockers

- No real wallet onchain data was queried **by this operator bridge** yet; unit tests use constructed fixtures.
- No canonical historical first-onboarding provenance retrieval; cannot trust a caller's claimed first round.
- No Sybil clearance, economic eligibility, exact-once **authoritative** event materialization, chain-finality attestations, validated full funding source or payout implementation.
- No mass-wallet indexing or batching performance evaluation.
- No operational UI, Claim/X processing or production activation.
- Needs formal review of VeBetterDAO Fair Use Rule before any active-network reward rollout.

**Do not run the preview SQL or the bridge on the production project, and do not merge the draft PR until all blockers are resolved.**
