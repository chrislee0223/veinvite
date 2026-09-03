# VeInvite First-Week Operations Checklist

Last updated: 2026-09-03

Purpose: operate Production without weakening eligibility, Sybil, reward, payout, privacy, or recovery controls.

## Before announcement or major release

- [ ] Public Production `/api/health` returns HTTP 200 and reports the expected mainnet/database/deployment revision state.
- [ ] Authenticated operator reward-operations health reports expected distributor, pause, gas, queue, pool, and payout readiness.
- [ ] Latest Production deployment is READY and has no unresolved build/runtime errors.
- [ ] Production Supabase is the live database; Preview data is not used for public reporting.
- [ ] Privacy and Terms pages are reachable.
- [ ] Public reward copy does not promise a fixed B3TR amount or guaranteed payout date.
- [ ] Public copy makes clear that the inviter, not the invitee, is the VeInvite referral-reward recipient after verified onboarding.
- [ ] Preview/debug/demo completion paths remain blocked in Production.
- [ ] Confirm the last known-good Production deployment is identifiable for rollback.

## First 24 hours after a meaningful release

Check at deployment, then periodically during the first day:

- [ ] Public Production health remains healthy and on mainnet without performing reward-pool/distributor diagnostics for anonymous callers.
- [ ] No sustained 5xx errors in wallet auth, invite creation/claim/status, reconciliation, or reward routes.
- [ ] New invitation rows have expected status transitions and network provenance.
- [ ] Active-existing-user rejections do not consume otherwise valid unused invitations.
- [ ] Self-referral attempts are rejected without consuming the invitation.
- [ ] Duplicate invitee wallets are rejected.
- [ ] Accepted invitations cannot be cancelled.
- [ ] Eligibility read failures fail closed rather than admitting users.
- [ ] Mission progress is sourced from on-chain evidence, not manual completion.
- [ ] Sybil REVIEW/BLOCKED cases remain excluded from automatic payout.
- [ ] Anonymous invite lookup does not expose inviter/invitee wallet relationships or stored mission progress.
- [ ] Non-operator wallets cannot render `/admin/*` pages or access operator APIs.

## Daily checks

- [ ] Review participant totals: NEW, RETURNING, ACTIVE_EXISTING, mission-complete, reward-queued.
- [ ] Review `operator_sybil_watchlist` for REVIEW/BLOCKED cases.
- [ ] Inspect unusual spikes in invitations per inviter, duplicate failures, self-referral failures, and rapid wallet clusters.
- [ ] Check reconciliation freshness and investigate invitations whose chain sync is repeatedly incomplete.
- [ ] Verify reward queue entries contain complete eligibility and mission evidence.
- [ ] Confirm no reward round is prepared while another round is still open.
- [ ] Confirm Sybil decisions cannot change after a reward entry is assigned to a round.
- [ ] Confirm automatic reward readiness is configured/registered/not paused before any payout iteration.
- [ ] Verify the automatic payout lock prevents overlapping payout workers.
- [ ] Verify no payout becomes PAID before submitted transaction finality is independently confirmed.
- [ ] Review housekeeping for expired wallet challenges, expired/revoked sessions, and stale rate-limit buckets.

## Automatic reward operating rule

The Production automatic reward pipeline is enabled, but it is fail-closed. An eligible-looking referral must not be paid unless the complete path is valid:

`entry proof → mission evidence → Sybil CLEAR → reward queue → funded reward round → immutable manifest → dedicated Reward Distributor signing/submission → finalized-chain verification → PAID + immutable receipt`

The dedicated Reward Distributor is separate from the app-admin wallet. Never expose its signing secret, seed phrase, or private key through client code, logs, support messages, screenshots, or public APIs.

As of 2026-09-03, no genuine Production referral has completed every payout requirement, so the first genuine automatic B3TR payout remains an operational E2E milestone. Do not fabricate a referral solely to exercise payout.

## What to record publicly

Safe public metrics should be factual and clearly scoped. Examples:

- number of invitations created
- number of eligible new users
- number of eligible returning users
- number of users who completed each mission stage
- number of fully completed onboarding quests
- finalized referral payouts actually paid

Do not report Preview/testnet records as Production activity. Do not report projected, pending, queued, prepared, or submitted amounts as rewards actually received. Only finalized PAID settlement may be described as paid.

## Stop / investigate conditions

Pause affected operations and investigate if any of the following occurs:

- Public Production health is not mainnet or database readiness fails.
- Authenticated operator reward-operations health reports a critical distributor, pause, gas, queue, pool, or payout condition.
- Wallet authentication signatures are failing broadly.
- Eligible/ineligible classifications look inconsistent across similar requests.
- Invitations are being consumed on failed eligibility checks.
- The same invitee wallet appears in more than one referral relationship.
- Mission completion occurs without the required on-chain evidence.
- Reward eligibility appears while Sybil status is not CLEAR.
- A reward assignment changes after the round has been sealed.
- A payout is marked PAID before the submitted transaction is finalized and verified.
- Automatic payout runs overlap despite the operator lock.
- Reward distributor identity/readiness no longer matches configured expectations.
- Anonymous/public APIs expose wallet relationships or sensitive operator internals that are not required for their public purpose.

## Support response principles

- Never ask for a seed phrase or private key.
- Ask for an invite code or transaction ID only when needed; avoid collecting unnecessary personal information.
- Distinguish chain/indexing delays from confirmed product errors.
- Do not manually override eligibility simply to unblock a user.
- Do not describe a wallet as abusive based on one weak signal alone.
- If a case is ambiguous, keep it under REVIEW until evidence is sufficient.

## Review cadence

Periodically:

- compare invitation creation → eligible claim → mission completion conversion rates
- review top user drop-off points
- review support questions and update the FAQ when rules or wording change
- review Sybil false-positive/false-negative signals before changing thresholds
- verify docs and CI still describe the actual Production reward architecture
- review whether UI/UX changes are warranted and validate mobile/multilingual impact before release
