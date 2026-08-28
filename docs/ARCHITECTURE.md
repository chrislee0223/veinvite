# Architecture

## User application

- Next.js App Router on Vercel
- VeChain Kit / VeWorld wallet connection
- Korean-first responsive UI with Korean and English copy
- Server route handlers for invitation, verification, analytics, and operator actions

## Authentication and data boundary

- Wallet-signature challenges create short-lived, revocable HTTP-only sessions.
- Supabase/PostgreSQL is the persistent source of truth.
- Participant and reward tables use RLS with no client policies; only reviewed server paths use the service role.
- Operator reports additionally require the verified reward-operator wallet.

## Verified onboarding flow

1. An inviter creates one active invite link.
2. The invitee signs in and is classified as `NEW`, `RETURNING`, or rejected as `ACTIVE_EXISTING` from on-chain history.
3. The accepted wallet completes three distinct VeBetterDAO dApp reward events.
4. After the first qualifying dApp event, the wallet converts B3TR to VOT3.
5. After conversion, the wallet casts an Allocation Vote.
6. A fresh Sybil decision is recorded after the vote.
7. Only complete raw evidence plus `CLEAR` can enter the reward queue.

## State and payout model

`PENDING_ACCEPTANCE → ACTIVATING → COMPLETED → reward queue`

`ACTIVATING/COMPLETED → UNDER_REVIEW → ACTIVATING/COMPLETED/BLOCKED`

- Reward rounds freeze eligible referrals into an immutable manifest.
- An operator signs the on-chain payout in VeWorld; the server does not store a payout private key.
- A payout becomes `PAID` only after finalized-chain verification and an immutable receipt.
- Mainnet funded referral rewards remain disabled until the explicit launch gates pass.

## Reporting

- The default operator scope is one exact VeBetterDAO voting round.
- A separate cumulative scope is available for all-time leaderboards and totals.
- Legacy rows without entry/raw-chain proof stay preserved for audit but are excluded from verified completion and reward totals.
