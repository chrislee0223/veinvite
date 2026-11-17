'use client';

import { reportProductAnalyticsEvent } from '@/lib/productAnalytics';
import { readUsageAnalyticsEnabled } from '@/lib/usageAnalyticsPreference';

export type NetworkInteractionName =
  | 'network_node_repositioned'
  | 'network_group_modified';

// Count engaged sessions, not pointer-move frames. The daily anonymous visitor
// identity is managed by the existing consent-gated analytics tracker.
const emitted = new Set<NetworkInteractionName>();
let recordedDay = '';

function currentSeoulDay(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function reportNetworkInteractionOnce(eventName: NetworkInteractionName): void {
  try {
    if (!readUsageAnalyticsEnabled()) return;
    const day = currentSeoulDay();
    if (day !== recordedDay) {
      emitted.clear();
      recordedDay = day;
    }
    if (emitted.has(eventName)) return;
    emitted.add(eventName);
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
): void {
  if (!after || JSON.stringify(before) === JSON.stringify(after)) return;
  reportNetworkInteractionOnce(
    kind === 'group' ? 'network_group_modified' : 'network_node_repositioned'
  );
}
