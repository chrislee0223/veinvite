# VeInvite First-Week Operations Checklist

Last updated: 2026-08-28

Purpose: operate the first public week without weakening eligibility, Sybil, reward, or payout controls.

## Before announcement

- [ ] Production `/api/health` returns HTTP 200, `database: ready`, `network: mainnet`.
- [ ] Latest production deployment is READY and has no unresolved build/runtime errors.
- [ ] Production Supabase is the live database; Preview data is not used for public reporting.
- [ ] Privacy and Terms pages are reachable.
- [ ] Public copy uses the onboarding-launch wording while mainnet funded rewards remain disabled.
- [ ] Do not publish a fixed B3TR reward amount or guaranteed payout date.
- [ ] Keep any Preview/debug-only route out of main and Production.
- [ ] Confirm the last known-good Production deployment is identifiable for rollback.

## First 24 hours

Check at launch, then periodically during the first day:

- [ ] Production health remains 200 / database ready / mainnet.
- [ ] No sustained 5xx errors in wallet auth, invite creation, invite claim, invite status, or reconciliation routes.
- [ ] New invitation rows have expected status transitions and network provenance.
- [ ] Active-existing-user rejections do not consume otherwise valid unused invitations.
- [ ] Self-referral attempts are rejected without consuming the invitation.
- [ ] Duplicate invitee wallets are rejected.
- [ ] Accepted invitations cannot be cancelled.
- [ ] Eligibility read failures fail closed rather than admitting users.
- [ ] Mission progress is sourced from on-chain evidence, not manual completion.
- [ ] Sybil REVIEW/BLOCKED cases are visible to the operator and are not automatically paid.

## Daily checks — days 2 to 7

- [ ] Review participant totals: NEW, RETURNING, ACTIVE_EXISTING, mission-complete, reward-queued.
- [ ] Review `operator_sybil_watchlist` for REVIEW/BLOCKED cases.
- [ ] Inspect unusual spikes in invitations per inviter, duplicate failures, self-referral failures, and rapid wallet clusters.
- [ ] Check reconciliation freshness and investigate invitations whose chain sync is repeatedly incomplete.
- [ ] Verify reward queue entries contain complete eligibility and mission evidence.
- [ ] Confirm no reward round is prepared while another round is still open.
- [ ] Confirm Sybil decisions cannot change after a reward entry is assigned to a round.
- [ ] If mainnet funded rewards are still disabled, verify no user payout transaction is initiated.
- [ ] If funded rewards are later enabled, require the full manifest → VeWorld approval → tx registration → finalized verification → settlement path; never mark PAID before final verification.

## What to record publicly

Safe public metrics should be factual and clearly scoped. Examples:

- number of invitations created
- number of eligible new users
- number of eligible returning users
- number of users who completed each mission stage
- number of fully completed onboarding quests

Do not report Preview/testnet records as Production activity. Do not report pending or queued amounts as rewards actually received. Only finalized PAID settlement may be described as paid.

## Stop / investigate conditions

Pause promotion and investigate if any of the following occurs:

- Production health is not mainnet or database is not ready.
- Wallet authentication signatures are failing broadly.
- Eligible/ineligible classifications look inconsistent across similar requests.
- Invitations are being consumed on failed eligibility checks.
- The same invitee wallet appears in more than one referral relationship.
- Mission completion occurs without the required on-chain evidence.
- Reward eligibility appears while Sybil status is not CLEAR.
- A reward assignment changes after the round has been sealed.
- A payout is marked PAID before the submitted transaction is finalized and verified.

## Support response principles

- Never ask for a seed phrase or private key.
- Ask for an invite code or transaction ID only when needed; avoid collecting unnecessary personal information.
- Distinguish chain/indexing delays from confirmed product errors.
- Do not manually override eligibility simply to unblock a user.
- Do not describe a wallet as abusive based on one weak signal alone.
- If a case is ambiguous, keep it under REVIEW until evidence is sufficient.

## End-of-week review

At the end of week 1:

- [ ] Compare invitation creation → eligible claim → mission completion conversion rates.
- [ ] Review top user drop-off points.
- [ ] Review support questions and add recurring issues to the public FAQ.
- [ ] Review Sybil false-positive/false-negative signals before changing thresholds.
- [ ] Review whether any UI/UX change is warranted; preview non-text visual changes before implementation.
- [ ] Decide whether public promotion should expand, remain limited, or pause for fixes.
