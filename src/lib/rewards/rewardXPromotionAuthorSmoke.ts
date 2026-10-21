import 'server-only';

import { enforceRateLimits } from '@/lib/rateLimitServer';

// One-time app-only read of X's own documented public developer account.
// No user wallet, promotion Post, or payout record is involved.
// Hard off after the explicitly configured UTC date.
const OFFICIAL_X_DEVELOPER_ID = '2244994945';
type Outcome = {
  status: 'SKIPPED' | 'BLOCKED' | 'ALREADY_RUN' |
    'READY' | 'PROVIDER_UNAVAILABLE';
  posts?: number;
};

export async function runXAuthorTimelineSmokeOnce(): Promise<Outcome> {
  const date = process.env.VEINVITE_X_AUTHOR_PROBE_UTC_DATE ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date) ||
      date !== new Date().toISOString().slice(0, 10) ||
      process.env.VEINVITE_X_PROMOTION_DISCOVERY_MODE !== 'off') {
    return { status: 'SKIPPED' };
  }
  const bearer = process.env.X_API_BEARER_TOKEN?.trim();
  if (!bearer) return { status: 'BLOCKED' };
  const limiter = await enforceRateLimits([{
    scope: 'x_promotion_author_probe_once',
    subject: 'official-x-developer-' + date,
    limit: 1,
    windowSeconds: 86400,
  }]);
  if (limiter) {
    return { status: limiter.status === 429 ? 'ALREADY_RUN' : 'BLOCKED' };
  }

  // Five Posts is the API minimum for the timeline endpoint. Once the
  // global limiter is claimed, at most five public Posts can be returned.
  // Only a 400 field-format mismatch causes one additional HTTP request.
  const endpoint = new URL(`https://api.x.com/2/users/${OFFICIAL_X_DEVELOPER_ID}/tweets`);
  endpoint.searchParams.set('max_results', '5');
  endpoint.searchParams.set('start_time', new Date(Date.now() - 6 * 86400_000).toISOString());
  endpoint.searchParams.set('exclude', 'replies,retweets');
  endpoint.searchParams.set('post.fields', 'created_at,entities');
  endpoint.searchParams.set('expansions', 'author_id,referenced_posts');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const init: RequestInit = {
      headers: { Authorization: `Bearer ${bearer}`, Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    };
    let response = await fetch(endpoint, init);
    if (response.status === 400) {
      const alternative = new URL(endpoint);
      alternative.searchParams.delete('post.fields');
      alternative.searchParams.delete('expansions');
      alternative.searchParams.set('tweet.fields', 'created_at,entities,author_id,referenced_tweets');
      response = await fetch(alternative, init);
    }
    if (!response.ok) {
      // Status code is safe, but never log provider tokens or response data.
      console.warn('X author timeline one-shot status', { httpStatus: response.status });
      return { status: 'PROVIDER_UNAVAILABLE' };
    }
    const body: unknown = await response.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return { status: 'PROVIDER_UNAVAILABLE' };
    }
    const data = (body as { data?: unknown[] }).data;
    if (data != null && !Array.isArray(data)) {
      return { status: 'PROVIDER_UNAVAILABLE' };
    }
    return { status: 'READY', posts: Math.min(data?.length ?? 0, 5) };
  } catch {
    return { status: 'PROVIDER_UNAVAILABLE' };
  } finally {
    clearTimeout(timer);
  }
}
