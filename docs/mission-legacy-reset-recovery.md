# Legacy mission reset recovery preflight

This patch is diagnostic only. No production DB mutations, no change to automatic reset eligibility, no change to the five-minute cadence, and no new cron. Do not treat the report as a proof of eligibility.

## Recovery gates
- For a historical carry-forward funding cohort, use finalized on-chain activation and round bounds to derive a **separate mission-entry round**. Never overwrite the funding cohort or receipt. Review both historical mission and funding windows for valid completion before allowing reset. Update the original-window reader, retry-state reader, proof writer, and atomic commit guard together; preserve completion and settlement protections. Do not use report snapshots alone as write authority.
- For missing entry proof, recover authoritative historical admission evidence or perform the appropriate review without inventing activation data or bypassing existing-user and Sybil checks.
- For released slots or pre-reservation completed history, reconcile historic payouts, eligibility, and slot ownership. Do not reopen automatically.
- For a valid expired entry with no resolution, inspect the actual prior-window scan, finalized bounds, lease, and atomic guard reason. No unverified absence proof may be recorded.
- Verify no changes to completed payouts, holds, inviter slots, Sybil restrictions, or existing active attempts; test both valid historical completion and incomplete expiry before rollout.
 
Run the operator-only SQL in `docs/staged-sql/mission_legacy_reset_preflight.sql` using authorized read-only access. The added bounded reason logs do not print wallet addresses, certificates, tokens or chain payloads. The existing failed-candidate log remains unchanged. This patch does not resolve any legacy invitation by itself.

## Second-stage recovery policy
A pure staged recovery planner in `src/lib/rewards/missionLegacyRecoveryPolicy.ts` distinguishes actual entry round from funding cohort without changing either. For carry-forward cases it requires reconciliation of both original windows; valid expired ordinary entries require their own window. Its output is NOT a reset authorization and must not be passed directly to a writer. No production worker imports it yet. Scheduler starvation is handled separately in PR #1358; do not merge conflicting worker changes before that PR is reconciled. Historical relationship backfill is corroborating evidence only, not a substitute for eligibility proof. Released-slot cases remain protected pending individual review.

## Verified pre-funding entry compatibility (staged, not a release)
The earliest indexed VeInvite allocation is R113. For original entries before R113 with no original funding receipt, an append-only, service-created, chain-verified NEW eligibility record can establish the original **mission** round; it does not create a funding cohort. The staged migration extends the existing atomic proof and reset functions only for the narrow verified marker. Its app scheduler change includes those records after eligibility reconstruction. Initial proof attachment and first reset must be one atomic transaction after production compatibility and isolated financial QA; do not attach the marker alone, fabricate missing activation blocks, reopen released slots, or grant an original unfunded payout. Normal funded invitations keep their existing path. Test the complete retry/funding/claim flow in the existing isolated PostgreSQL workflow before applying any migration. No production data changes are included in this draft.

## Production DDL verification
The isolated PostgreSQL financial/claim and application checks passed at 84111a7944200e92abe97306715a4680158deeca. The exact staged SQL was applied as 20261125153120_mission_legacy_verified_entry_recovery_v1 and the four existing RPCs plus the new helper were verified not executable by anon or authenticated. This migration by itself does not reconstruct historical eligibility or create attempts; those operations require the individually verified transaction described above.
