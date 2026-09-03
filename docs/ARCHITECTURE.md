# Architecture

## User application

- Next.js App Router on Vercel
- VeChain Kit / VeWorld wallet connection
- 27 reviewed app locales with RTL/script-aware layout safeguards
- Server route handlers for invitation, permanent referral-link activation, verification, analytics, rewards, and operator actions
- Each inviter has one permanent `/r/<key>` referral identity and two reusable onboarding concurrency slots.
- Existing one-time `/i/<code>` invitations remain readable and actionable for backward compatibility.
- Public invite/referral reads are passive and privacy-minimized; detailed wallet relationship/progress data requires an owner wallet session.
- Permanent referral pages are `noindex`; usage analytics stores only the coarse `invite_landing` view and never the raw referral key.

## Authentication and data boundary

- Wallet-signature challenges create short-lived, revocable HTTP-only sessions.
- Production sessions use `__Host-` cookies with Secure / HttpOnly / SameSite safeguards.
- Multiple devices can keep independent verified sessions for the same wallet; serialized issuance keeps at most five active sessions per wallet.
- Supabase/PostgreSQL is the persistent source of truth.
- Participant and reward tables use RLS with no client policies; only reviewed server paths use the service role.
- Every `/admin/*` page is hidden behind a server-validated operator session, and operator APIs independently re-check authorization.
- Operator membership is verified from the VeBetterDAO `appAdmin` and `rewardDistributors` on-chain state.

## Verified onboarding flow

1. An inviter shares the same permanent referral link. Merely opening it does not create an invitation or reserve capacity.
2. The invitee signs in and is classified as `NEW`, `RETURNING`, or rejected as `ACTIVE_EXISTING` from on-chain history.
3. Only an eligible authenticated wallet atomically reserves the first available reusable friend slot (1 or 2) and receives a normal immutable invitation code for its mission lifecycle.
4. Self-referrals, already-referred wallets, sponsor-cycle attempts, and attempts made while both slots are occupied do not create an invitation.
5. The accepted wallet completes three distinct VeBetterDAO dApp reward events.
6. After the first qualifying dApp event, the wallet converts at least 1 B3TR to VOT3.
7. After conversion, the wallet casts an Allocation Vote.
8. Fresh Sybil / VePassport signals are evaluated before reward eligibility settles.
9. Only complete raw evidence plus the required clear safety state can enter the reward queue.

The slot is concurrency capacity, not referral identity. Completion, cancellation of an unused legacy invitation, or a final Sybil `BLOCKED` decision releases reusable capacity while immutable invitation/referral audit history remains preserved.

## Permanent referral data model

- `referral_links` stores one active random referral key per inviter. It is separate from `invitations` so link visits cannot inflate participant counts.
- `referral_link_attempts` records authenticated activation outcomes such as active-existing, duplicate, self-referral, cycle, slots-full, and verification failure without creating an invitation for rejected attempts.
- `invitations.referral_link_id` records v2 provenance; legacy one-time links keep this field null.
- `invitations.invite_slot` is bounded to `1 | 2` and immutable after creation.
- The database keeps a partial unique index on `(lower(inviter_wallet), invite_slot)` for active slot-occupying states. `BLOCKED` rows remain auditable but are excluded from the concurrency predicate.
- Permanent-link claims use deterministic advisory locks for the invitee and inviter, then allocate slot 1 or 2 inside one transaction before reusing the hardened entry-proof claim function.
- The immutable sponsor graph rejects cycles independently of the two-slot concurrency model. Future binary network placement remains a separate concept from direct sponsorship.

## Reward state and automatic payout model

`PENDING_ACCEPTANCE → ACTIVATING → COMPLETED → ELIGIBLE → reward queue`

`ACTIVATING/COMPLETED → UNDER_REVIEW → ACTIVATING/COMPLETED/BLOCKED`

- Eligible referrals are frozen into funded reward rounds only after immutable entry/mission evidence is revalidated.
- Reward eligibility and payout uniqueness are per invitation code, not per inviter wallet. If one inviter successfully completes two friend onboardings, each invitation is independently verified for reward eligibility.
- Reward rounds are tied to actual VeBetterDAO allocation receipts and a bounded distributable budget.
- Each payout round has an immutable manifest and chain checkpoint.
- Automatic signing uses a dedicated Reward Distributor that is separate from the app-admin wallet and must match the configured public address.
- The distributor must be registered on-chain and all runtime/emergency-pause safety gates must pass.
- Signed transactions, submissions, and settlements are journaled so retries cannot silently create a second payout.
- A payout becomes `PAID` only after finalized-chain verification confirms the submitted clauses and `RewardDistributed` events exactly match the immutable manifest.
- The independent Vercel cron is a recovery path; normal eligible-progress reconciliation can also trigger an immediate fail-closed payout iteration.
- The automatic pipeline is enabled on mainnet, but no genuine Production referral has yet completed every eligibility requirement, so the first live automatic B3TR payout is still pending a real eligible referral.

## Reporting

- The default operator scope is one exact VeBetterDAO voting round.
- A separate cumulative scope is available for all-time leaderboards and totals.
- Permanent-link issuance/visits are not participant counts. Reporting should distinguish link existence/traffic, eligibility attempts, rejected attempts, actual invitation activation, verified completion, and payout.
- Legacy rows without entry/raw-chain proof stay preserved for audit but are excluded from verified completion and reward totals.
- Public health exposes only uptime/revision-safe status; detailed reward/gas/queue diagnostics remain operator-only.

## Deployment safety

- Production and Preview Supabase identities are hard-separated and checked before server DB requests.
- Production is mainnet-only and cannot silently fall back to the reviewed Preview database/network.
- Production bundles force demo UI off, while demo completion is independently restricted to Preview/local development.
- `/ui-test` and reward/security self-test routes are unavailable in Production.
- Permanent-referral schema and RPC changes are validated on the dedicated Preview database first. The legacy one-time creation API remains explicitly slot-1-only, so dropping the old global one-active index does not let old clients create a hidden second invite during rollout.
