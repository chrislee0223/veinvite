import 'server-only';

import { enforceRateLimits } from '@/lib/rateLimitServer';
import { reserveXApiReadBudget } from '@/lib/rewards/rewardXPromotionApiBudget';

const AUTHOR_ID = /^[0-9]{1,19}$/u;
const MAX_POSTS_PER_READ = 10;
const TIMEOUT_MS = 8_000;

// X's app-only User Posts API uses an OAuth-attested numeric user ID.
// This avoids a broad domain search whose first page may omit genuine posts.
// An explicit DAILY_READ_CALLS limit is mandatory for the paid provider path.
export type AuthorTimelinePost = {
  id?: string;
  author_id?: string;
  created_at?: string;
  entities?: { urls?: { expanded_url?: string }[] };
  referenced_tweets?: { id?: string; type?: string }[];
  referenced_posts?: { id?: string; type?: string }[];
};
export type AuthorTimelineRead = {
  status: 'READY' | 'BUDGET_LIMIT' | 'COOLDOWN' | 'DISABLED' | 'UNAVAILABLE';
  posts: AuthorTimelinePost[];
  truncated: boolean;
};

function readDailyLimit(): number {
  const raw = process.env.VEINVITE_X_PROMOTION_DAILY_READ_CALLS ?? '';
  if (!/^(?:[1-9]|1[0-9]|20)$/u.test(raw)) return 0;
  return Number(raw);
}

export async function readBoundAuthorPosts(
  authorId: string,
  openedAt: string,
): Promise<AuthorTimelineRead> {
  const empty = (status: AuthorTimelineRead['status']): AuthorTimelineRead => ({
    status, posts: [], truncated: false,
  });
  if (process.env.VEINVITE_X_PROMOTION_DISCOVERY_MODE !== 'live' ||
      process.env.VEINVITE_X_PROMOTION_DISCOVERY_STRATEGY !== 'author' ||
      !AUTHOR_ID.test(authorId) || !Number.isFinite(Date.parse(openedAt))) {
    return empty('DISABLED');
  }
  const bearer = process.env.X_API_BEARER_TOKEN?.trim();
  const dailyLimit = readDailyLimit();
  if (!bearer || dailyLimit === 0) return empty('DISABLED');

  // Avoid repeated reads of the same author's Posts every 15 minutes.
  // Both keys are shared atomically across all server instances.
  const cooldown = await enforceRateLimits([{
    scope: 'x_promotion_author_cooldown',
    subject: authorId,
    limit: 1,
    windowSeconds: 3600,
  }]);
  if (cooldown) return empty(cooldown.status === 429 ? 'COOLDOWN' : 'UNAVAILABLE');
  const day = new Date().toISOString().slice(0, 10);
  const budget = await enforceRateLimits([{
    scope: 'x_promotion_daily_reads',
    subject: day,
    limit: dailyLimit,
    windowSeconds: 86400,
  }]);
  if (budget) return empty(budget.status === 429 ? 'BUDGET_LIMIT' : 'UNAVAILABLE');
  // Reserve a worst-case $0.06 for up to ten Posts and an expanded User.
  if (!await reserveXApiReadBudget('TIMELINE')) return empty('BUDGET_LIMIT');

  // On each successful rate-limit claim, at most one page of ten public
  // Posts is read. 400 field-format fallback can make one extra HTTP request
  // but does not request a second page of billable Posts.
  const endpoint = new URL(`https://api.x.com/2/users/${authorId}/tweets`);
  endpoint.searchParams.set('max_results', String(MAX_POSTS_PER_READ));
  endpoint.searchParams.set('start_time', new Date(Date.parse(openedAt) - 60_000).toISOString());
  endpoint.searchParams.set('exclude', 'replies,retweets');
  endpoint.searchParams.set('post.fields', 'created_at,entities');
  endpoint.searchParams.set('expansions', 'author_id,referenced_posts');

  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), TIMEOUT_MS);
  try {
    const init: RequestInit = {
      headers: { Authorization: `Bearer ${bearer}`, Accept: 'application/json' },
      signal: abort.signal,
      cache: 'no-store',
    };
    let response = await fetch(endpoint, init);
    if (response.status === 400) {
      const alternate = new URL(endpoint);
      alternate.searchParams.delete('post.fields');
      alternate.searchParams.delete('expansions');
      alternate.searchParams.set('tweet.fields', 'created_at,entities,author_id,referenced_tweets');
      response = await fetch(alternate, init);
    }
    if (!response.ok) return empty('UNAVAILABLE');
    const body: unknown = await response.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return empty('UNAVAILABLE');
    }
    const data = body as {
      data?: AuthorTimelinePost[];
      meta?: { next_token?: string };
    };
    if (data.data !== undefined && !Array.isArray(data.data)) return empty('UNAVAILABLE');
    const posts = (data.data ?? [])
      .filter((post) => post && typeof post === 'object' &&
        (post.author_id === undefined || post.author_id === authorId))
      .map((post) => ({ ...post, author_id: authorId }));
    return {
      status: 'READY',
      posts,
      truncated: typeof data.meta?.next_token === 'string' &&
        data.meta.next_token.length > 0,
    };
  } catch {
    return empty('UNAVAILABLE');
  } finally {
    clearTimeout(timeout);
  }
}
