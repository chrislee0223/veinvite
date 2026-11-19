# VeInvite multilevel — atomic preview rehearsal, November 19, 2026

## Safety status

**Private preview ONLY. NO production merge, SQL migration, live payout, claim, wallet signature, balance reservation, X payout or cron activation.** This code is a rehearsal of future accounting—not an authoritative reward engine.

Branch: `feature/multilevel-rewards-staging-20261119`
Draft PR: https://github.com/chrislee0223/veinvite/pull/1350
Preview DB: `bpppslplhmppxzvdkwxs`
Production DB (left unchanged): `upfjvkidaqtnbmmnhupz`

## Implemented

1. `src/lib/rewards/multilevelUplineSnapshot.ts`: builds up to five immutable ancestry levels from trusted, event-time referral edges; prevents retroactive reparenting, simultaneous competing parents, cycles and duplicates. The network UI binary placement is **not** a source of financial ancestry. Test: `tests/reward-multilevel-upline-snapshot.test.mjs`.
2. `src/lib/rewards/multilevelSettlementManifest.ts`: converts the exact-Wei 60/30/10, 70/15/8/5/2 calculator into a stable round manifest with complete verified event IDs, per-entitlement 90/10, per-reason returns, leader ties, and next-round carry. Test: `tests/reward-multilevel-settlement-manifest.test.mjs`.
3. `src/lib/rewards/multilevelPreviewSettlementBridge.ts`: server-only, unreachable from production routes, disabled by default; refuses unless Vercel Preview + exact Preview Supabase project + testnet + explicit rehearsal flag. Calls only the private rehearsal RPC.
4. `docs/staged-sql/20261119_multilevel_atomic_settlement_rehearsal_preview_v1.sql`: service-role-only DB function `public.multilevel_preview_rehearse_settlement_v1`. Uses one transaction, an advisory round lock, exact Wei integer parsing, SHA-256 manifest fingerprint, immutable verified-event set match, actual prior carry reconciliation, category budgets, result idempotency, individual entitlements/returns/carry, and DB-enforced seal conservation. **Never creates claims or sends tokens.**
5. `docs/staged-sql/20261119_multilevel_exact_distribution_guard_preview_v1.sql`: independent DB check of **each** amount, recipient wallet, ancestor level, missing/inactive share, rounding dust, leader winner and equal tie amount, and empty-category 50:50. Total equal alone is **not** accepted.
6. `docs/staged-sql/20261119_multilevel_active_upline_proof_preview_v1.sql`: tenth RLS-private table `verified_round_activity`; all claimed active ancestors must match independently reviewed same-round activity records, not an unverified `active:true` snapshot. Immutable, cannot be inserted once the round is frozen.
7. `docs/staged-sql/20261119_multilevel_stage_index_hardening_preview_v1.sql`: targeted source-round and return ancestry FK indexes following Supabase preview performance advisor results.
8. Reproducible synthetic-only rollback fixture: `docs/staged-sql/20261119_multilevel_atomic_rehearsal_fixture_test.sql`. **All test changes end with ROLLBACK.**

## Preview SQL application order

All prior preview schema files in `docs/staged-sql` must be applied first. The new files were applied to Preview only in this order:

1. `20261119_multilevel_atomic_settlement_rehearsal_preview_v1.sql`
2. `20261119_multilevel_exact_distribution_guard_preview_v1.sql`
3. `20261119_multilevel_stage_index_hardening_preview_v1.sql`
4. `20261119_multilevel_active_upline_proof_preview_v1.sql`
5. Run `20261119_multilevel_atomic_rehearsal_fixture_test.sql` (rollback-only)

## Verified in preview

- Happy path: participant pool 1,000 Wei (already **80% participant funds**, not gross VeInvite pool), onboarding 600 / active 300 / leader 100; five-level amounts 70/15/8/5/2; inside-gross X 10%; atomic SEAL; replay yields `ALREADY_REHEARSED_NO_PAYOUT`; no claim leg.
- Attack tests rejected: forged first recipient wallet, changed 70/15 split with same overall total, omitted verified event, fictitious category carry, and active ancestor with no reviewed activity record. After each rejection the round stays DRAFT and **zero partial entitlements** remain.
- Nonempty onboarding with inactive/missing ancestors plus empty active category: an independently verified sparse scenario ended with **550 paid entitlement-gross / 300 general return / 150 same-category carry** out of 1,000; incorrect inactive second level rejected.
- Production read-only aggregate: `network_qualified_referral_relationships` currently has 21 mainnet completed, historically valid edges; no duplicate parents or missing effective blocks found, but this **does not constitute a verified 5-level payment snapshot**.
- Production historical onboarding `COMPLETED` count 48 includes 27 active invalidations; 21 survived strict legacy checks. These are historical review candidates only; **they do not receive any new payouts automatically**.
- Supabase preview security advisor flags **RLS-enabled with no policy** on private tables. This is intentional: anon/authenticated have no schema/table permissions. Existing warnings for unrelated public preview functions were not modified.
- No observation was promoted into a live or preview payable entitlement from an actual user. All synthetic test inserts were rolled back.

## Still required before financial correctness and production launch

- An independently audited producer that **actually verifies** every actor's wallet ownership, 3 dApps + VOT3 + next-round vote for onboarding, activity + vote for existing members, accepted Sybil clearance / invalidation and finality; current private review snapshots are **not self-authenticating**.
- Authoritative, historical five-level referral graph, with effective block and independent status snapshot (not browser/local/uncleared DB data), and exact-once promotion of eligible chain candidates into frozen `verified_events`.
- Independently authorized and reconciled onchain funding provenance; general return to next round without double-counting; late Claim / X expiry and concurrent broadcast reconciliation. The current preview rehearsal explicitly lacks any transfer authority.
- Scalability and concurrency tests with real network load, existing claim and notification regression, 2 parallel invitation slots, retry after 2 rounds, UI and multilingual text.
- Real production Supabase **complete backup and restore rehearsal**, full rollback verification and VeBetterDAO Fair Use confirmation; obtain explicit operator launch/round approval **before changing any production configuration**.

The user did **not** authorize a production rollout; never merge this draft PR or run the new SQL in production while blockers remain.
