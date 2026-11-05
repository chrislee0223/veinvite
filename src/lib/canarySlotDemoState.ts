import type { NetworkInviteSlotState } from '@/lib/networkInviteSlotsClientCache';

// Memory-only visual state for the authenticated canary fixture. Reloading the
// page resets it so the release flow is repeatable. Never write fake referrals.
const releasedSlotOneByWallet = new Set<string>();
const WALLET_PATTERN = /^0x[0-9a-f]{40}$/i;

export const CANARY_SLOT_DEMO_RELEASED_EVENT = 'veinvite-canary-slot-demo-released';

export function isCanarySlotDemoReleased(wallet: string, slot: 1 | 2): boolean {
  return slot === 1 && releasedSlotOneByWallet.has(wallet.toLowerCase());
}

export function releaseCanarySlotDemo(wallet: string, slot: 1 | 2): boolean {
  // The caller must have just validated this wallet's private canary fixture.
  // The completed 5/5 slot is intentionally not releasable.
  if (!WALLET_PATTERN.test(wallet) || slot !== 1) return false;
  releasedSlotOneByWallet.add(wallet.toLowerCase());
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CANARY_SLOT_DEMO_RELEASED_EVENT, {
      detail: { wallet: wallet.toLowerCase(), slot },
    }));
  }
  return true;
}

export function applyCanarySlotDemoRelease(
  wallet: string,
  slots: NetworkInviteSlotState[],
): NetworkInviteSlotState[] {
  if (!isCanarySlotDemoReleased(wallet, 1)) return slots;
  return slots.map((slot) =>
    slot.slot === 1
      ? { slot: 1, state: 'AVAILABLE' as const, inviteeWallet: null, completedSteps: 0, totalSteps: 5 }
      : slot,
  );
}

/**
 * Caller received an authenticated owner-only slot response. Centralize the
 * fixture discriminator outside the production Network canvas runtime.
 */
export function applyVerifiedCanarySlotDemoResponse(
  wallet: string,
  payload: unknown,
  slots: NetworkInviteSlotState[],
): NetworkInviteSlotState[] {
  if (!payload || typeof payload !== 'object' ||
      (payload as { canaryFixture?: unknown }).canaryFixture !== true) return slots;
  return applyCanarySlotDemoRelease(wallet, slots);
}
