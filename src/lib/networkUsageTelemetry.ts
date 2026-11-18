'use client';

import { reportProductAnalyticsEvent } from '@/lib/productAnalytics';
import {
  readUsageAnalyticsEnabled,
  USAGE_ANALYTICS_PREFERENCE_EVENT,
  USAGE_ANALYTICS_WALLET_AUTH_EVENT,
} from '@/lib/usageAnalyticsPreference';

export type NetworkInteractionName =
  | 'network_node_repositioned'
  | 'network_group_modified';

// Deduplicate transport attempts for each active wallet and action type on
// a given Seoul day. The wallet remains in volatile browser memory only;
// neither the wallet nor this dedupe key is persisted or included in telemetry.
const emitted = new Set<string>();
let recordedDay = '';
let resetListenersInstalled = false;

function currentSeoulDay(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function ensureResetListeners(): void {
  if (resetListenersInstalled || typeof window === 'undefined') return;
  resetListenersInstalled = true;

  // A Network edit may have happened while the wallet was displayed but
  // server verification was still finishing. Permit another event after
  // authentication, so an initial anonymous attempt does not mask use.
  window.addEventListener(USAGE_ANALYTICS_WALLET_AUTH_EVENT, () => {
    emitted.clear();
  });
  window.addEventListener(USAGE_ANALYTICS_PREFERENCE_EVENT, (event) => {
    if ((event as CustomEvent<unknown>).detail === true) emitted.clear();
  });
}

export function reportNetworkInteractionOnce(
  eventName: NetworkInteractionName,
  activeWallet: string | null,
): void {
  try {
    if (!activeWallet || !readUsageAnalyticsEnabled()) return;
    ensureResetListeners();
    const day = currentSeoulDay();
    if (day !== recordedDay) {
      emitted.clear();
      recordedDay = day;
    }

    const dedupeKey = `${activeWallet.trim().toLowerCase()}|${eventName}`;
    if (emitted.has(dedupeKey)) return;
    emitted.add(dedupeKey);
    reportProductAnalyticsEvent({ eventName, outcome: 'success' });
  } catch {
    // Observational telemetry must never interrupt drags, edits or autosave.
  }
}

/** Count completed workspace changes, not camera pans or cancelled drags. */
export function reportCompletedNetworkDrag(
  kind: 'node' | 'slot' | 'group' | 'group-member',
  before: import('@/lib/networkWorkspace').NetworkFocusWorkspace,
  after: import('@/lib/networkWorkspace').NetworkFocusWorkspace | null,
  activeWallet: string | null,
): void {
  if (!after || JSON.stringify(before) === JSON.stringify(after)) return;
  reportNetworkInteractionOnce(
    kind === 'group' ? 'network_group_modified' : 'network_node_repositioned',
    activeWallet,
  );
}
