# VeInvite Staging / Preview E2E Readiness

## Purpose

This checklist keeps Preview validation isolated from Production and makes the wallet-auth rollout order explicit.

## Preview environment

Preview must use the dedicated Preview Supabase project rather than the Production project. The server-side database guard intentionally fails closed if a Preview deployment is pointed at Production.

Required Preview variables include the Preview values for:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SECRET_KEY`

Production values must remain Production-only.

## Wallet-auth rollout order

The new application verifies signatures and asks the database RPC `issue_wallet_session_after_verified_challenge` to consume the challenge, revoke old sessions, and create the replacement session atomically.

For Production, use this order:

1. Apply `20260830085000_prepare_wallet_auth_rpc_predeploy.sql`. It installs the serialized RPC only and deliberately adds no uniqueness constraint, so the currently deployed application remains compatible.
2. Deploy the reviewed application code that recovers concurrent challenge uniqueness races and calls the atomic RPC.
3. Apply `20260830090238_harden_wallet_auth_atomicity.sql`.
4. Apply `20260830092018_serialize_wallet_session_issuance.sql`.
5. Re-run health, authentication, release-integrity, and reward-accounting checks.

Do not reverse steps 1 and 2 by adding the challenge uniqueness index while the old challenge route is still live.

## Smoke checks

- `/api/health` returns HTTP 200 and reports database availability.
- Wallet connect and wallet signature verification complete normally.
- Wallet disconnect clears the VeInvite server session.
- Invite landing and progress views distinguish invalid links from temporary failures.
- Language selectors show the reviewed country flag assets without artificial white tiles.
- Admin endpoints reject unauthenticated requests before expensive VeChain RPC reads.
- Leaderboard wallet details remain inspectable and explorer links work.
- Mainnet funded-reward preparation stays disabled unless it is explicitly approved and enabled.

## Release gate

Do not merge into Production while Preview health is failing or while Preview is connected to Production data. Passing GitHub CI alone is not enough; the current PR head must also pass a real Preview smoke test against the isolated Preview database.
