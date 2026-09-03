# VeInvite Launch Readiness — reviewed 2026-09-03

This checklist is a hard gate for Production changes. Do not treat app endorsement, allocation, or a funded reward pool as permission to bypass eligibility, Sybil, payout, privacy, or deployment checks.

## P0 — Must remain true in Production

- [x] Production code does not use demo eligibility outcomes.
- [x] Production demo-completion API is blocked even if a public demo flag is misconfigured.
- [x] Every inviter/invitee mutation requires a verified wallet session.
- [x] Wallet sessions are revocable and support up to five independent active devices per wallet.
- [x] Self-referral is rejected without consuming the invite or penalizing the wallet.
- [x] Accepted invitations cannot be cancelled by the inviter.
- [x] Entry eligibility is verified against real VeBetter reward/voting history and fails closed on node/indexing errors.
- [x] Production database has network provenance, atomic entry-proof storage, append-only impact/Sybil evidence, and hardened reward eligibility.
- [x] No referral can become ELIGIBLE without eligible entry proof + 3 distinct dApp reward events + B3TR→VOT3 conversion + later Allocation Vote + fresh Sybil CLEAR + complete reconciliation evidence.
- [x] Anonymous invite status lookup does not expose inviter/invitee wallet addresses or stored mission progress.
- [x] `/admin/*` rendering is protected by a server-side operator gate; operator APIs remain independently authorized.
- [x] Terms and Privacy pages contain no draft/testnet placeholder language. Final jurisdiction-specific legal review remains external.
- [x] Site title/description/canonical/social metadata are present.

## Infrastructure boundary

- [x] Production and Preview Supabase identities are separated and protected by fail-closed environment/project guards.
- [x] Production cannot silently fall back to a non-mainnet VeBetter network.
- [x] Only `main` auto-deploys to Production under the reviewed Vercel deployment policy.
- [x] Public `/api/health` exposes only deployment/readiness information needed for uptime and stale-deployment checks; detailed reward operations remain behind operator authorization.
- [x] Preview/debug diagnostic paths are blocked in Production.

## Legacy Production referrals

Existing accepted/completed referrals created before the audited entry-proof system must never be auto-grandfathered into rewards. Preserve them for audit, but keep rows without trustworthy immutable entry proof non-eligible. `status=COMPLETED` alone is never sufficient for payout.

## Automatic reward safety gate

The automatic Production reward pipeline is enabled but fail-closed. It uses a dedicated Reward Distributor rather than the app-admin wallet.

- [x] Automatic payout requires an explicit enabled flag plus a configured distributor address and signing secret.
- [x] The signing secret must cryptographically derive to the configured distributor address.
- [x] Distributor registration and pause/readiness state are checked before transfer work.
- [x] Reward rounds freeze validated queue entries into an immutable payout manifest.
- [x] Automatic worker overlap is prevented by an operator lease/lock.
- [x] Signed transaction, submission, settlement, and recovery state are persisted for crash-safe reconciliation.
- [x] A payout becomes PAID only after finalized-chain verification and immutable receipt/accounting updates.
- [x] Operations funds remain outside the referral reward distribution path.
- [x] No distributor signing secret is exposed to browser/client bundles or public APIs.
- [ ] First genuine Production eligible referral → automatic B3TR payout E2E has occurred and been independently reconciled. As of 2026-09-03 there is no Production referral that satisfies every payout condition, so this remains intentionally unforced.

## Data/reporting gate

- [ ] Background recovery reaches the desired freshness target independently of page visits. The current independent fallback cron is daily on the existing hosting plan.
- [x] Public NEW/RETURNING reporting is fail-closed around the reviewed reporting baseline and excludes unqualified legacy history.
- [x] Completed-round growth reports are append-only snapshots; changed evidence creates a new version with a required revision reason.
- [x] Public leaderboard data is intentionally auditable, while invitation relationship/progress data is not publicly exposed through invite-link lookup.
- [x] Durable reward/accounting/audit rows are preserved; housekeeping only removes transient challenge/session/rate-limit data according to retention rules.

## Release-day operations

- [ ] Latest PR CI is fully green before merge.
- [ ] Merged `main` commit SHA matches the Production deployment revision.
- [ ] Vercel Production deployment reaches READY with no unresolved build/runtime errors.
- [ ] Production health returns expected mainnet/database/revision/automatic-readiness state.
- [ ] Anonymous invite smoke test confirms no wallet relationship or detailed progress leakage.
- [ ] Verified invite owner smoke test still restores required detailed progress.
- [ ] Non-operator `/admin/*` access is rejected while the operator path still works.
- [ ] Production demo-completion path remains blocked.
- [ ] Current reward queue/round/payout state matches the database and no unexpected transfer is initiated.
- [ ] Last known-good Production deployment remains identifiable for rollback.

## Next QA upgrade

Add browser-level Playwright coverage for mobile/desktop invite opening, wallet/session recovery, language switching, admin denial, and key layout/error states. Current CI is strong on static/server/data invariants but does not yet replace real-browser regression coverage.
