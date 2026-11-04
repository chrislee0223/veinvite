import type { InviteRecord } from '@/lib/types';

type CanarySlot = {
  slot: 1 | 2;
  inviteeWallet: string;
  completedSteps: number;
  totalSteps: 5;
};

const WALLET_PATTERN = /^0x[0-9a-f]{40}$/i;

/**
 * Client-side display projection of the authenticated, owner-only canary API.
 * The returned objects are never eligible for real invite/reward processing.
 */
export function deriveCanaryHomeInvites(
  payload: unknown,
  ownerWallet: string,
): InviteRecord[] | null {
  if (!payload || typeof payload !== 'object' ||
      !WALLET_PATTERN.test(ownerWallet)) return null;
  const response = payload as {
    canaryFixture?: unknown;
    slots?: unknown;
  };
  if (response.canaryFixture !== true || !Array.isArray(response.slots) ||
      response.slots.length !== 2) return null;

  const slots: CanarySlot[] = [];
  for (const input of response.slots) {
    if (!input || typeof input !== 'object') return null;
    const slot = input as Record<string, unknown>;
    if ((slot.slot !== 1 && slot.slot !== 2) ||
        typeof slot.inviteeWallet !== 'string' ||
        !WALLET_PATTERN.test(slot.inviteeWallet) ||
        slot.totalSteps !== 5 ||
        typeof slot.completedSteps !== 'number' ||
        !Number.isInteger(slot.completedSteps) ||
        slot.completedSteps < 0 || slot.completedSteps > 5 ||
        slots.some((candidate) => candidate.slot === slot.slot)) return null;
    slots.push(slot as unknown as CanarySlot);
  }

  return slots.map((slot): InviteRecord => ({
    code: `CANARY_VISUAL_ONLY_${slot.slot}`,
    inviterAddress: ownerWallet,
    inviteeAddress: slot.inviteeWallet,
    inviteSlot: slot.slot,
    status: slot.completedSteps === 5 ? 'COMPLETED' : 'ACTIVATING',
    createdAt: '2026-11-05T00:00:00.000Z',
    updatedAt: '2026-11-05T00:00:00.000Z',
    rewardEligibility: 'NONE',
    sybilStatus: 'CLEAR',
    appsCompleted: Math.min(3, slot.completedSteps),
    vot3Converted: slot.completedSteps >= 4,
    voteCompleted: slot.completedSteps >= 5,
  }));
}
