# VeInvite round-bounded retry: verified foundation, NOT LIVE (2026-11-17)

This PR **does not** activate user-facing mission retries. It ships an isolated
private attempt ledger, a read-only expiry classifier, and a guarded owner-only
GET/POST API that cannot start an attempt without **both**:
- `VEINVITE_MISSION_RETRY_READY=true` on the trusted server, and
- `reward_admission_bridge.mission_retry_settings_v1.enabled=true`.

Both are false/absent in Production. No cron, new notifications, payout
modifications, invitation status reset, Sybil erasure, or extra service costs.

## Verified live Mainnet baseline
- Existing accepted incomplete: 24.
- 21 have a verified original cohort far outside their N+1 vote window and
  classify `EXPIRED`.
- 2 very old legacy entries (3KH8K2W and WVYTYY6) have **no original
  eligibility_check_id or reward_cohort_round_id**: they classify
  `LEGACY_UNBOUND_EXPIRED_REVIEW`. Do not grant a retry or any reward until
  provenance is repaired/verified; never invent an entry proof.
- 1 has cohort 124 and a round-125 vote window: leave it alone.
- Existing eligible claimants ACXKGKC and R4LKDJM, all paid, blocked and
  security-REVIEW records remain protected.

Legacy expiration **does not release physical money**: those incomplete
referrals already hold zero immutable reward liability under shared-pool v1.

## Immutable design and counterexamples verified in PostgreSQL 17
- Invitation identity/activation/funding evidence stays append-only/immutable.
- One distinct attempt per referral and dApp round, never two ACTIVE attempts.
- Attempt N: 3 dApps in round N, vote in N+1, then expire in N+2.
- A repeated miss closes the old attempt and starts a fresh new one.
- Re-entry cannot reuse old events because the future scanner must enforce
  attempt_start_block and round boundaries.
- Already completed, reserved, paid, cancelled, Sybil-blocked/review, or
  unverified-legacy entries cannot start an attempt.
- Authenticated invitee session required for POST; onchain round and block
  boundaries loaded server-side, not trusted from browser.
- Invitation funding/balance/payout queues untouched.

## Non-negotiable remaining implementation BEFORE enabling
1. **Attempt-aware chain scanner**: for each attempt, count only distinct
   external dApps with positive post-start B3TR reward events from round N,
   verify VOT3 conversion on the same attempt, then the vote in N+1.
   Persist attempts and chain event positions independently of the immutable
   original invitation checkpoint. Do not mix legacy first dApp events.
2. **Canonical guarded funding and payout integration**: the legacy
   invitation's original funding cohort is immutable, so it cannot be silently
   reused for a newly restarted round. The new attempt needs an independently
   verified per-round funding receipt, Sybil clearance and exact-once claim
   accounting through the existing payout pipeline. Never bypass the canonical
   reservation/signer, X bonus budget, recovery offsets, or identity gate.
3. **Owner UX and localization**: only after above is tested, show
   expiry/restart controls using existing notification types and all supported
   locales. Before cutover, the new GET status remains private and no public
   restart button is advertised.
4. Preview negative/positive test matrix: concurrent starts, block boundary,
   expired and rejected legacy, zero reward, sybil review, one previous paid,
   source pool underfunded, two overlapping rounds, genuine re-entrant
   completion, X option reserve, immutable slot identity, no double funding.
5. Future-only opt-in via independent reviewed switch, never retroactively
   rewriting existing paid or verified Claim rows.

## Rollback
This is append-only storage with disabled writes. Keeping the tables/readers
without enabling retry is safe. No Production invitation rows are rewritten.
Do not delete migration history. Never switch both flags on before completing
the remaining canonical scanner/finance/UI work.
