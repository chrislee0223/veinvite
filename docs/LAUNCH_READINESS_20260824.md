# VeInvite Launch Readiness — 2026-08-24

This checklist is a hard gate for the first allocation-voting launch. Do not treat an endorsed app or funded reward pool as permission to bypass these checks.

## P0 — Must pass before public production cutover

- [ ] Production code no longer uses demo eligibility outcomes.
- [ ] Every inviter/invitee mutation requires a verified wallet session.
- [ ] Self-referral is rejected without consuming the invite or penalizing the wallet.
- [ ] Accepted invitations cannot be cancelled by the inviter.
- [ ] New-user entry eligibility is verified against real VeBetter reward/voting history and fails closed on node/indexing errors.
- [ ] Production database has network provenance, atomic entry-proof storage, append-only impact/Sybil evidence, and hardened reward eligibility.
- [ ] No referral can become ELIGIBLE without: eligible entry proof + 3 distinct dApp reward events + allocation vote event + fresh Sybil CLEAR + complete reconciliation evidence.
- [ ] Production Preview/DB environment isolation is verified.
- [ ] VeWorld wallet flow is tested end-to-end on the launch candidate.
- [ ] Mobile invite creation, link opening, wallet switching, disconnect/reconnect, and error states are tested.
- [ ] Terms and Privacy pages are launch-ready and contain no draft/testnet placeholder language.
- [ ] Site title/description/canonical/social metadata are present.

## Legacy production referrals

Existing accepted referrals created before the audited entry-proof system must never be auto-grandfathered into rewards. Preserve them for audit, then either reconstruct valid entry evidence against their original activation boundary or keep them non-eligible. Historical rows missing a trustworthy activation boundary must remain non-eligible.

## Reward launch gate

- [ ] Mainnet user reward distribution remains OFF until VeBetterDAO RuleBook interpretation is explicitly cleared or the qualification design is changed to be clearly compliant.
- [ ] Receiving an X-Allocation does not automatically enable user payouts.
- [ ] Only the Rewards Distribution Pool may be distributed; operations funds stay outside it.
- [ ] Dedicated distributor signer is used; no admin/treasury private key is exposed to the app.
- [ ] Payment path has SENDING state, idempotency, transaction persistence, receipt verification, crash recovery, and a kill switch before mainnet transfer code is enabled.

## Data/reporting gate

- [ ] Background reconciliation runs independently of page visits.
- [ ] Data-quality gate is clean before operator/public metrics are reported.
- [ ] Public weekly reporting is mainnet-only, UTC-scoped, launch-baselined, and based on raw chain evidence.
- [ ] Published weekly reports are immutable snapshots with explicit revisions rather than silent rewrites.

## Launch-day operations

- [ ] Confirm VeInvite appears in the new mainnet allocation voting list.
- [ ] Confirm production health after deployment.
- [ ] Watch Vercel runtime errors and Supabase data-quality state during first traffic.
- [ ] Keep automatic payouts disabled.
- [ ] Have a rollback target ready (last known-good production deployment).
