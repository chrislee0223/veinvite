import 'server-only';

import { enforceRateLimits } from '@/lib/rateLimitServer';
import { searchRecentPosts } from '@/lib/rewards/rewardXPromotionAutoDiscovery';

// Operator-authorized, explicitly UTC-day-scoped provider entitlement test.
// A single rate-limit bucket guarantees at most ONE run during that UTC date.
// No user offers, provider tokens, or financial state are ever modified.
type ProbeStatus = 'SKIPPED' | 'ALREADY_RUN' | 'BLOCKED' | 'SEARCH_OK' | 'SEARCH_UNAVAILABLE';
export type XSearchProbeOutcome = {
  status: ProbeStatus;
  searchPosts?: number;
  truncated?: boolean;
};

export async function runXPromotionSearchProbeOnce(): Promise<XSearchProbeOutcome> {
  const day = process.env.VEINVITE_X_PROMOTION_SEARCH_PROBE_UTC_DATE ?? '';
  // An unset date is a hard-off switch, not a permanent recurring probe.
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(day) ||
      day !== new Date().toISOString().slice(0, 10) ||
      process.env.VEINVITE_X_PROMOTION_DISCOVERY_MODE !== 'off') {
    return { status: 'SKIPPED' };
  }

  // Fail closed if shared DB rate-limiter is unavailable. The fixed-day key
  // and 24-hour window cover the entire remaining UTC date, even if cron
  // starts a few seconds after midnight or an operator manually re-runs it.
  const limited = await enforceRateLimits([{
    scope: 'x_promotion_search_probe_once',
    subject: 'veinvite-x-search-probe-' + day,
    limit: 1,
    windowSeconds: 86_400,
  }]);
  if (limited) {
    return { status: limited.status === 429 ? 'ALREADY_RUN' : 'BLOCKED' };
  }

  // One search page of at most 10 public Posts. On HTTP 400, the existing
  // adapter may retry once with the alternate documented field spelling.
  // No X contents or credentials are logged, and this code cannot pay B3TR.
  const start = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const search = await searchRecentPosts(start);
  return search
    ? { status: 'SEARCH_OK', searchPosts: search.posts.length, truncated: search.truncated }
    : { status: 'SEARCH_UNAVAILABLE' };
}
