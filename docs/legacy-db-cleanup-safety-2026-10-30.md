# Legacy database cleanup safety review (2026-10-30)

Scope: **read-only Production inspection** of Supabase project `upfjvkidaqtnbmmnhupz`. The purpose of this document is to prevent accidental removal of historical objects during future refactors. No DB objects were changed.

## Confirmed dependencies — preserve

| Table | Estimated rows (PostgreSQL statistics, not exact) | Referencing views | Decision |
| --- | ---: | --- | --- |
| `public.legacy_entry_classification_backfill` | 7 | `operator_accepted_wallet_languages`, `operator_invitation_funnel`, `operator_referral_leaderboard`, `qualified_referral_relationships` | **Do not drop**: live view dependencies exist. |
| `public.reward_reservation_legacy_exclusions` | 2 | None found via `pg_rewrite` | **Do not drop** without checking application/RPC reads and historical reward integrity. |
| `public.veinvite_archive_manifest_events` | 0 | `operator_long_term_data_health` | **Do not drop**: monitoring view dependency exists. |
| `public.veinvite_archive_manifests` | 0 | `operator_long_term_data_health` | **Do not drop**: monitoring view dependency exists. |

Database dependency records include constraints and view rewrite dependencies. **Counts of dependency records do not represent numbers of active application call sites.** Empty or rarely used archive tables may be intentionally retained for future operations.

## Advisor findings (candidates only)

- Four unindexed foreign-key warnings (three on `reward_boost_current_topup_plans`, one on `sybil_v2_invitee_reinstatement_events`). Evaluate query plans and write amplification before adding indexes.
- 44 unused-index notices. **Do not drop based on cumulative scan count alone**: indexes may support rare but critical reward/recovery operations; stats can reset.
- 144 RLS-without-policy notices. This can be intentional for server-only tables. Inspect roles and grants before treating as a vulnerability or changing policies.

## Safe future removal protocol

1. Identify runtime imports, routes, cron jobs, RPC calls, and read/write references.
2. Identify SQL views, constraints, functions, triggers, and RLS/grants using catalog queries.
3. Verify no historical reward, Sybil audit, recovery, reconciliation, or reporting requirement.
4. Add a regression test that fails if retired behavior is reintroduced.
5. Make removals on an isolated branch, run checks, then review a deployment preview.
6. Deploy only after independent review; avoid overlapping the separate reward-calculation work.

**Status:** Inventory in progress. No removal approved and no Production change made.
