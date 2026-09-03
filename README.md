# VeInvite

VeInvite is a verified onboarding and growth dApp for the VeBetterDAO ecosystem.

## Core flow

- Each inviter has one permanent referral link that can be shared repeatedly.
- Up to two eligible friends can be in onboarding at the same time through two reusable friend slots.
- Merely opening a permanent referral link does not create an invitation or consume a slot; a slot is reserved only after wallet verification and entry eligibility succeed.
- Existing one-time `/i/<code>` links remain supported for backward compatibility.
- The invitee connects a wallet and is checked against VeInvite entry rules.
- Progress is verified from VeChain / VeBetterDAO evidence rather than self-reported completion.
- Qualified referrals enter the automatic reward queue per completed invitation.
- Public reporting and leaderboard surfaces expose aggregate and wallet-level audit context.

## Safety model

VeInvite keeps Production and Preview infrastructure separated. A non-production deployment is not allowed to access the reviewed Production Supabase project, and a Production deployment is not allowed to silently fall back to a non-mainnet VeBetter network.

Permanent-link activation is fail-closed and atomic. Authenticated ineligible wallets, self-referrals, duplicate referral wallets, sponsor-cycle attempts, and attempts made while both friend slots are occupied do not create a new invitation. A Sybil-blocked referral keeps its audit history but releases reusable concurrency capacity.

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
npm run test:i18n
node --test tests/referral-*.test.mjs
npm run build
node scripts/check-migration-history.mjs
node scripts/check-ui-stability.mjs
node scripts/check-server-stability.mjs
```

## Deployment note

Preview deployments must use the dedicated Preview Supabase project. Schema changes that enable permanent referral links and two-slot activation are validated against Preview before Production. Existing one-time invite creation remains slot-1-only and protected by the per-slot uniqueness guard, so old clients cannot silently create a second invitation during rollout.
