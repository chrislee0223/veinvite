# VeInvite

VeInvite is a verified onboarding and growth dApp for the VeBetterDAO ecosystem.

## Core flow

- An inviter creates one invite.
- The invitee connects a wallet and is checked against VeInvite entry rules.
- Progress is verified from VeChain / VeBetterDAO evidence rather than self-reported completion.
- Qualified referrals enter the automatic reward queue.
- Public reporting and leaderboard surfaces expose aggregate and wallet-level audit context.

## Safety model

VeInvite keeps Production and Preview infrastructure separated. A non-production deployment is not allowed to access the reviewed Production Supabase project, and a Production deployment is not allowed to silently fall back to a non-mainnet VeBetter network.

Mainnet-funded reward preparation remains controlled by explicit runtime safety switches and is not enabled by ordinary UI or deployment changes.

Language selectors use app-owned country SVG assets and intentionally avoid artificial white background tiles around flags.

## Development

```bash
npm install
npm run dev
```

Validation before release:

```bash
npm run typecheck
npm run test:rewards
npm run build
node scripts/check-migration-history.mjs
node scripts/check-ui-stability.mjs
node scripts/check-server-stability.mjs
```

## Deployment note

Preview deployments must use the dedicated Preview Supabase project. Wallet authentication rollout uses a compatibility migration that installs the atomic session RPC before the application depends on it; uniqueness constraints are applied only once the compatible application code is live.
