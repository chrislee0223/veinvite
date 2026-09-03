# Architecture

## User application

- Next.js App Router on Vercel
- VeChain Kit / VeWorld wallet connection
- 27 reviewed app locales with RTL/script-aware layout safeguards
- Server route handlers for invitation, verification, analytics, rewards, and operator actions
- Public invite reads are passive and privacy-minimized; detailed wallet relationship/progress data requires an owner wallet session

## Authentication and data boundary

- Wallet-signature challenges create short-lived, revocable HTTP-only sessions.
- Production sessions use `__Host-` cookies with Secure / HttpOnly / SameSite safeguards.
- Multiple devices can keep independent verified sessions for the same wallet; serialized issuance keeps at most five active sessions per wallet.
- Supabase/PostgreSQL is the persistent source of truth.
- Participant and reward tables use RLS with no client policies; only reviewed server paths use the service role.
- Every `/admin/*` page is hidden behind a server-validated operator session, and operator APIs independently re-check authorization.
- Operator membership is verified from the VeBetterDAO `appAdmin` and `rewardDistributors` on-chain state.

## Verified onboarding flow

1. An inviter creates one active invite link.
2. The invitee signs in and is classified as `NEW`, `RETURNING`, or rejected as `ACTIVE_EXISTING` from on-chain history.
3. The accepted wallet completes three distinct VeBetterDAO dApp reward events.
4. After the first qualifying dApp event, the wallet converts at least 1 B3TR to VOT3.
5. After conversion, the wallet casts an Allocation Vote.
6. Fresh Sybil / VePassport signals are evaluated before reward eligibility settles.
7. Only complete raw evidence plus the required clear safety state can enter the reward queue.

## Reward state and automatic payout model

`PENDING_ACCEPTANCE → ACTIVATING → COMPLETED → ELIGIBLE → reward queue`

`ACTIVATING/COMPLETED → UNDER_REVIEW → ACTIVATING/COMPLETED/BLOCKED`

- Eligible referrals are frozen into funded reward rounds only after immutable entry/mission evidence is revalidated.
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
- Legacy rows without entry/raw-chain proof stay preserved for audit but are excluded from verified completion and reward totals.
- Public health exposes only uptime/revision-safe status; detailed reward/gas/queue diagnostics remain operator-only.

## Deployment safety

- Production and Preview Supabase identities are hard-separated and checked before server DB requests.
- Production is mainnet-only and cannot silently fall back to the reviewed Preview database/network.
- Production bundles force demo UI off, while demo completion is independently restricted to Preview/local development.
- `/ui-test` and reward/security self-test routes are unavailable in Production.
