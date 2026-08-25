# VeInvite

VeInvite is a verified onboarding and reactivation dApp for the VeBetterDAO ecosystem. The current application runs on VeChain mainnet with Next.js, VeChain Kit wallet connectivity, Supabase/Postgres persistence, and on-chain activity verification.

## Current production flow

- One active invitation slot per participant and atomic first-eligible-claimant link ownership.
- Signed wallet authentication before protected invitation actions.
- Entry classification as `NEW`, `RETURNING`, or recently active existing user.
  - `NEW`: no prior qualifying VeBetterDAO reward or allocation-vote history was detected before onboarding.
  - `RETURNING`: historical qualifying activity exists, but no reward or allocation-vote activity was detected during the previous 12 completed rounds; activity in the current round is also guarded against.
  - Recently active existing users are not eligible for VeInvite onboarding.
- Post-invite reconciliation records qualifying B3TR reward activity across three distinct VeBetterDAO apps and a subsequent allocation vote using on-chain evidence and stored block checkpoints.
- Reward eligibility is derived from verified entry proof, mission evidence, completion checkpoints, and anti-abuse state rather than from client-side progress alone.
- Verified `NEW` and `RETURNING` referrals that reach reward eligibility are automatically placed into a durable, network-scoped reward queue for a future settlement round.
- Korean and English user-facing eligibility and mission UX are maintained together.

## Reward safety

The reward queue does **not** transfer B3TR. Automatic token transfers remain disabled while reward-round funding, reservation, and settlement logic are completed and audited. Existing reward dry-run tooling is read-only and uses the durable queue as its candidate source.

See `README_KO.md` and the `docs/` directory for additional project notes.
