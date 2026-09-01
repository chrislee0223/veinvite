# VeInvite Infinite Referral Canvas rollout

Status: PREBUILT / NOT LIVE

This document freezes the intended rollout boundary for the two-slot Infinite Referral Canvas so the visual feature can be prepared in advance without changing the current live round.

## Current live behavior that must remain unchanged until explicit activation

- One live invite opportunity per inviter remains the current policy.
- Current reward eligibility, payout economics, Sybil rules, funded gate, signer/distributor, and automatic payout pipeline are unchanged.
- The Infinite Referral Canvas is available only through the preview/development `/ui-test` surface.
- Preview nodes are mock data. They do not read or write Production invitations.
- Clicking an open preview slot does not create an invitation.

## Prebuilt pieces

- `src/components/InfiniteReferralCanvas.tsx`
  - Reusable canvas presentation component.
  - Pointer drag/pan.
  - Mouse wheel zoom.
  - Touch pinch zoom.
  - Node focus/re-centering.
  - Two child slots per node in the visual model.
  - NEW / RETURNING / in-progress / open-slot visual states.
  - Korean and English UI copy.
  - No database or wallet side effects.

- `src/components/InfiniteReferralCanvasPreview.tsx`
  - Mock binary referral tree for design testing.
  - Explicitly states that the current live invite policy remains one slot.
  - Demonstrates open-slot interaction without creating invites.

- `src/app/ui-test/page.tsx`
  - Renders the preview only in local development or Vercel Preview.
  - Production continues to return 404 for `/ui-test`.

## Activation checklist for a future round

Do not activate these items individually. Treat them as one reviewed rollout.

1. Confirm the intended effective round/date for the two-slot policy.
2. Change the live invite-slot limit from 1 to 2 in invitation creation/validation logic.
3. Review and update database constraints/queries that assume one invitation per inviter.
4. Preserve self-invite, duplicate-wallet, NEW/RETURNING entry proof, and Sybil protections for both slots.
5. Keep reward ownership first-level only: an inviter can be rewarded only for their own direct invited user. No upline/downline or multi-level payout.
6. Recalculate reward forecasts because increasing invite capacity can increase the number of eligible recipients per funded round.
7. Add a read-only referral-tree API that returns only data safe for the connected wallet/public visualization.
8. Do not expose full wallet addresses by default. Use shortened addresses and explicit detail interaction where appropriate.
9. Connect real tree data to `InfiniteReferralCanvas` and replace preview mock nodes.
10. Add the Production navigation entry only after the real-data API is verified.
11. Verify Korean/English wording and mobile touch behavior.
12. Run Preview E2E and Production-safe dry runs before enabling the second invite slot.
13. Confirm existing one-slot invitations remain valid and are not duplicated or re-numbered during migration.
14. Confirm ACTIVE_EXISTING wallets are still rejected before invitation consumption and do not appear as accepted tree members.
15. Explicit owner approval is required before changing the live slot limit or any reward-policy implication.

## Intended product rule

The canvas may visualize referral descendants across unlimited generations, but monetary/referral rewards remain direct-only. Visual lineage is not multi-level compensation.

## Suggested Production data contract

A future read-only tree endpoint can expose nodes shaped like:

```ts
{
  id: string;
  parentId: string | null;
  slot: 1 | 2;
  walletLabel: string;
  status: 'ROOT' | 'NEW' | 'RETURNING' | 'PENDING' | 'OPEN';
  missionProgress: 0 | 1 | 2 | 3 | 4;
}
```

The server should derive eligibility/status from authoritative live entry-proof and invitation evidence. Legacy audit classifications may be displayed as historical metadata where necessary, but must never independently confer live reward eligibility.
