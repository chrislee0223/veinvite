'use client';

import { reportProductAnalyticsEvent } from '@/lib/productAnalytics';
import { readUsageAnalyticsEnabled } from '@/lib/usageAnalyticsPreference';

export type NetworkInteractionName =
  | 'network_node_repositioned'
  | 'network_group_modified';

// Count engaged sessions, not pointer-move frames. The daily anonymous visitor
// identity is managed by the existing consent-gated analytics tracker.
const emitted = new Set<NetworkInteractionName>();

export function reportNetworkInteractionOnce(eventName: NetworkInteractionName): void {
  try {
    if (emitted.has(eventName) || !readUsageAnalyticsEnabled()) return;
    emitted.add(eventName);
    reportProductAnalyticsEvent({ eventName, outcome: 'success' });
  } catch {
    // Observational telemetry must never interrupt drags, edits or autosave.
  }
}
