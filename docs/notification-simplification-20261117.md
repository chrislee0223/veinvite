# VeInvite notification simplification (2026-11-17)

## Scope and invariant
User-facing categories: **18 → 11**, with the internal-only Sybil watch unchanged.
Immutable history kinds (19), primary keys, receipt identifiers, dedupe keys,
security cases, read acknowledgements and settlement RPCs are preserved for
financial and audit consistency. No new cron, notifications API, SQL RLS policy,
VeChain query, or recurring cost is introduced.

## Grouping
- Progress: INVITE_ACCEPTED, DAPP_PROGRESS, VOT3_CONVERTED
- Core financial: REWARD_READY, REWARD_PAID, X_PROMOTION_PAID,
  REWARD_ADJUSTED, INVITE_INELIGIBLE
- Security: SECURITY_REVIEW (pre-/post-payout),
  SECURITY_CLEARED (pre-/post-payout),
  SECURITY_RESTRICTION (account/referral),
  SECURITY_HOLD, SECURITY_RESTORED (account/referral)

## Noise and semantic fixes
- 1/3 and 2/3 dApp updates remain visible on the existing progress/dashboard
  but are no longer generated as individual new bell notifications; 3/3 remains.
- Accepted, dApp completion and VOT3 progress share one presentation heading,
  while bodies retain their stage-specific facts.
- 'REWARD_READY' all-locale copy instructs the user to check claim status
  without prematurely saying reward was sent.
- A paid receipt announcement no longer concatenates the claim-ready copy.
- Security categories remain separate from their underlying immutable events:
  a post-payout review still explicitly says already-paid B3TR is unaffected;
  restrictions and cleared reviews still use their correct recipient scope.

## What deliberately stays
Historical audit rows are retained, not deleted. The existing SQL history
projection supersedes stale progress after verified payment or final security
outcomes. Transient X share eligibility, 24-hour conditions, on-chain payout,
and Sybil decisions are not modified.

## QA
Registry coverage, 29 locale updates, reduced low-value progress noise, and
no stale claim-ready text in paid-receipt UI are checked by regression tests,
in addition to CI typecheck/build/browser QA.
