# Legacy mission reset recovery preflight

This patch is diagnostic only. No production DB mutations, no change to automatic reset eligibility, no change to the five-minute cadence, and no new cron. Do not treat the report as a proof of eligibility.

## Recovery gates
- For a historical carry-forward funding cohort, use finalized on-chain activation and round bounds to derive a **separate mission-entry round**. Never overwrite the funding cohort or receipt. Review both historical mission and funding windows for valid completion before allowing reset. Update the original-window reader, retry-state reader, proof writer, and atomic commit guard together; preserve completion and settlement protections. Do not use report snapshots alone as write authority.
- For missing entry proof, recover authoritative historical admission evidence or perform the appropriate review without inventing activation data or bypassing existing-user and Sybil checks.
- For released slots or pre-reservation completed history, reconcile historic payouts, eligibility, and slot ownership. Do not reopen automatically.
- For a valid expired entry with no resolution, inspect the actual prior-window scan, finalized bounds, lease, and atomic guard reason. No unverified absence proof may be recorded.
- Verify no changes to completed payouts, holds, inviter slots, Sybil restrictions, or existing active attempts; test both valid historical completion and incomplete expiry before rollout.
 
Run the operator-only SQL in `docs/staged-sql/mission_legacy_reset_preflight.sql` using authorized read-only access. The added bounded reason logs do not print wallet addresses, certificates, tokens or chain payloads. The existing failed-candidate log remains unchanged. This patch does not resolve any legacy invitation by itself.
