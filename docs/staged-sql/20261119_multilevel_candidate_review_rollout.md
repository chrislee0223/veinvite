# VeInvite — nonpayable chain + legacy + 5-level review stage (2026-11-19)

**Environment:** Preview Supabase project `bpppslplhmppxzvdkwxs`. **No live production changes, SQL, Claim creation or B3TR transfers.** Draft PR: https://github.com/chrislee0223/veinvite/pull/1350

## Read-only production source audit (aggregate, no addresses exported)

- The canonical `network_qualified_referral_relationships` view reports **21 mainnet currently qualified direct referral edges**, **4 second-level chains**, **0 at levels 3–5**, **0 detected cycles** at valid effective-block cutoffs.
- Prior read-only Sybil audit found 48 historically `COMPLETED` invitations, **27 with active invalidation** and 21 structural candidates; mere `PAID`/`COMPLETED` flags must **not** constitute new active eligibility.
- The canonical view is a current filtered projection, not necessarily a complete immutable archive of every canceled/refollowed historic parent. It is NOT yet the complete source-of-truth needed to authorize retroactive graph payout.

## Added

1. `src/lib/rewards/multilevelCandidateReconciliation.ts` combines **already chain-observed** rewarded dApp + vote for existing onboarded members, existing historical onboarding clearance, latest Sybil state and event-time 5-level ancestors; it repeats the actual evidence verdict instead of trusting a caller's `eligible` flag. Every output has `status:REVIEW_REQUIRED` and `payable:false`.
2. **Bug prevented:** snapshot referral parents at the earliest block when both valid rewarded activity and vote have occurred, **not round-end**. A same-round reparent after the person's completion cannot redirect already-earned ancestry. Tests cover before/after completion.
3. `src/lib/rewards/multilevelPreviewEvidenceSnapshot.ts` and adjusted observation bridge: deterministic canonical source hash includes official closed round windows, rewards, votes, and VOT3 conversion, while omitting the changing current-best-block field. A different reward receipt or window changes the fingerprint.
4. `src/lib/rewards/multilevelPreviewReviewBridge.ts`: feature-branch server-only disabled-by-default testnet Preview writer; requires exact Preview DB URL, `VERCEL_ENV=preview`, `VECHAIN_NETWORK` matching the request and `VEINVITE_MULTILEVEL_PREVIEW_REVIEW_ENABLED=true`. Rejected candidates never write, and the scan fingerprint must match the already staged chain source.
5. `docs/staged-sql/20261119_multilevel_readonly_review_packets_preview_v1.sql` installed **only on Preview**. Adds **11th** private RLS-enabled table `candidate_review_packets`. Service-role-only RPC requires a matching positive chain observation and strictly nonpayable reviewed source; rows are immutable and idempotent. It **never** inserts `verified_events`, `verified_round_activity`, `entitlements` or `claim_legs`.
6. Regression: `tests/reward-multilevel-candidate-reconciliation.test.mjs` (legitimate case, invalidation, restricted wallet, zero B3TR, missing vote, stale round, missing independent activity, same-round reparent, graph ambiguity and same-round onboarding exclusion); `tests/reward-multilevel-preview-observation-fingerprint.test.mjs`.
7. `docs/staged-sql/20261119_multilevel_candidate_review_fixture_test.sql` is reproducible rollback-only test. In Preview, insertion, idempotent replay, rejection of `payable:true`, mismatch in source fingerprint and conflicting immutable review were verified. All synthetic data was rolled back.

## Checks / launch blockers

- All private staging tables RLS-on, no `anon`/`authenticated` execution on review RPC. The outputs, even when structurally eligible, are **not approved claims**.
- **Not implemented:** real-user mainnet end-to-end source-of-truth sync into preview; authenticated immutable archive of referrals including canceled and re-invited wallets; independent block finality and Sybil re-review at settlement; qualified event promotion and real funding/payout. Real B3TR must never move based on reviewed packets.
- The current preview-only testnet reader does not automatically bridge or copy production user data. This is deliberate to prevent unapproved cross-environment financial authority.
- No new user policy decision has been required in this phase. Existing rules unchanged.
- Do not merge/deploy this PR or run the SQL on the Production Supabase project. Final cutover still requires independent full backup + restore rehearsal, official VeBetterDAO Fair Use review and explicit operator approval.
