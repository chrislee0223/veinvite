import 'server-only';

import { readBoundAuthorPosts } from '@/lib/rewards/rewardXPromotionAuthorTimeline';
import {
  findVeInvitePromotionUrl,
  lookupXPromotionPost,
} from '@/lib/rewards/rewardXPromotionXApi';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { getVeBetterNetworkConfig } from '@/lib/vebetter/network';

// The existing post-submit and verification RPCs remain the only authority for
// eligibility. Discovery never creates an obligation or executes a payout.
const MAX_OFFERS = 200;
// Domain-wide reads cost money. Bound the maximum billable search results.
const MAX_SEARCH_PAGES = 1;
const SEARCH_PAGE_SIZE = 10;
const X_TIMEOUT_MS = 8_000;
const WALLET = /^0x[0-9a-f]{40}$/iu;
const POST_ID = /^[0-9]{1,32}$/u;
const INVITE_CODE = /^[A-HJ-NP-Z2-9]{7}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
type Mode = 'off' | 'probe' | 'live';
type Opportunity = {
  invite_code: string;
  recipient_wallet: string;
  share_token: string;
  opened_at: string | null;
  post_deadline_at: string;
  submission_grace_seconds: number;
};
type SearchPost = {
  id?: string;
  author_id?: string;
  created_at?: string;
  entities?: { urls?: { expanded_url?: string }[] };
  referenced_tweets?: { id?: string; type?: string }[];
  referenced_posts?: { id?: string; type?: string }[];
};
type SearchPage = {
  data?: SearchPost[];
  meta?: { next_token?: string };
};

export type XPromotionDiscoveryResult = {
  mode: Mode;
  checked: boolean;
  offers: number;
  searched: number;
  matched: number;
  submitted: number;
  ignored: number;
  failed: number;
  truncated: boolean;
  status: 'DISABLED' | 'NO_OFFERS' | 'READY' | 'SEARCH_UNAVAILABLE' | 'QUERY_INCOMPLETE' | 'BUDGET_LIMIT';
};

function mode(): Mode {
  const value = process.env.VEINVITE_X_PROMOTION_DISCOVERY_MODE;
  return value === 'live' || value === 'probe' ? value : 'off';
}

function expandedUrls(post: SearchPost): string[] {
  return Array.isArray(post.entities?.urls)
    ? post.entities.urls
        .map((url) => typeof url.expanded_url === 'string' ? url.expanded_url : '')
        .filter(Boolean)
    : [];
}

function originalPublicPost(post: SearchPost): boolean {
  return Boolean(
    typeof post.id === 'string' &&
    POST_ID.test(post.id) &&
    typeof post.author_id === 'string' &&
    POST_ID.test(post.author_id) &&
    typeof post.created_at === 'string' &&
    Number.isFinite(Date.parse(post.created_at)) &&
    (!Array.isArray(post.referenced_tweets) || post.referenced_tweets.length === 0) &&
    (!Array.isArray(post.referenced_posts) || post.referenced_posts.length === 0),
  );
}

export async function searchRecentPosts(startTime: string): Promise<{
  posts: SearchPost[];
  truncated: boolean;
} | null> {
  const bearer = process.env.X_API_BEARER_TOKEN?.trim();
  if (!bearer) return null;

  const posts: SearchPost[] = [];
  let next: string | undefined;
  for (let page = 0; page < MAX_SEARCH_PAGES; page += 1) {
    const url = new URL('https://api.x.com/2/tweets/search/recent');
    url.searchParams.set('query', 'url:veinvite.vercel.app -is:retweet -is:reply -is:quote');
    // X's published Recent Search quickstart uses tweet.fields. Request
    // author_id directly (not only via includes/users expansion), otherwise
    // originalPublicPost safely rejects every result as unverified.
    // Some X deployments use post.fields; retry that spelling on HTTP 400.
    url.searchParams.set('tweet.fields', 'created_at,entities,author_id,referenced_tweets');
    url.searchParams.set('sort_order', 'recency');
    url.searchParams.set('max_results', String(SEARCH_PAGE_SIZE));
    url.searchParams.set('start_time', startTime);
    if (next) url.searchParams.set('next_token', next);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), X_TIMEOUT_MS);
    let response: Response;
    try {
      const init: RequestInit = {
        headers: { Authorization: `Bearer ${bearer}`, Accept: 'application/json' },
        signal: controller.signal,
        cache: 'no-store',
      };
      response = await fetch(url, init);
      if (response.status === 400) {
        // Only a malformed-request response triggers field-format fallback;
        // never retry entitlement, rate-limit, or provider failures.
        const alternate = new URL(url);
        alternate.searchParams.delete('tweet.fields');
        alternate.searchParams.set('post.fields', 'created_at,entities,author_id,referenced_posts');
        alternate.searchParams.set('expansions', 'author_id,referenced_posts');
        response = await fetch(alternate, init);
      }
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      // 403 (search not entitled), 429 (budget/rate limit), and 5xx all fail
      // closed. The manually submitted URL path remains available.
      console.warn('X promotion discovery search not ready', { status: response.status });
      return null;
    }
    let body: SearchPage;
    try {
      body = await response.json() as SearchPage;
    } catch {
      return null;
    }
    if (!body || (body.data != null && !Array.isArray(body.data))) return null;
    posts.push(...(body.data ?? []));
    next = typeof body.meta?.next_token === 'string' ? body.meta.next_token : undefined;
    if (!next) return { posts, truncated: false };
  }

  // A budgeted scan cannot prove completeness when more pages exist.
  return { posts, truncated: Boolean(next) };
}

export async function runXPromotionAutoDiscovery(): Promise<XPromotionDiscoveryResult> {
  const currentMode = mode();
  const result: XPromotionDiscoveryResult = {
    mode: currentMode, checked: false, offers: 0, searched: 0,
    matched: 0, submitted: 0, ignored: 0, failed: 0,
    truncated: false, status: 'DISABLED',
  };
  if (currentMode === 'off') return result;
  // Production must never perform unlimited paid domain-wide reads when an
  // operator flips only the live switch. Both an author-only strategy and
  // an explicit 1..20 shared daily read cap are required before any live scan.
  if (currentMode === 'live' &&
      (process.env.VEINVITE_X_PROMOTION_DISCOVERY_STRATEGY !== 'author' ||
       !/^(?:[1-9]|1[0-9]|20)$/u.test(
         process.env.VEINVITE_X_PROMOTION_DAILY_READ_CALLS ?? '',
       ))) {
    return { ...result, status: 'DISABLED' };
  }

  const { network } = getVeBetterNetworkConfig();
  const now = Date.now();
  // Open opportunities are at most 24h old; grace extends submission, not
  // the original posting deadline. A wider filter lets each row's grace
  // window be enforced precisely in JS.
  const { data, error } = await supabaseAdmin
    .from('reward_x_promotion_opportunities')
    .select('invite_code,recipient_wallet,share_token,opened_at,post_deadline_at,submission_grace_seconds')
    .eq('network', network)
    .gte('post_deadline_at', new Date(now - 86_400_000).toISOString())
    .order('post_deadline_at', { ascending: false })
    .limit(MAX_OFFERS + 1);
  if (error) throw new Error('X promotion discovery opportunity lookup failed.');
  if ((data?.length ?? 0) > MAX_OFFERS) {
    return { ...result, status: 'QUERY_INCOMPLETE', failed: 1, truncated: true };
  }

  const opportunities = ((data ?? []) as Opportunity[]).filter((item) => {
    const opened = Date.parse(item.opened_at ?? '');
    const deadline = Date.parse(item.post_deadline_at);
    return INVITE_CODE.test(item.invite_code) && WALLET.test(item.recipient_wallet) && UUID.test(item.share_token) &&
      Number.isFinite(opened) && Number.isFinite(deadline) &&
      opened <= now && deadline >= opened &&
      Number.isSafeInteger(item.submission_grace_seconds) &&
      item.submission_grace_seconds >= 0 &&
      deadline + item.submission_grace_seconds * 1000 > now;
  });
  result.offers = opportunities.length;
  if (!opportunities.length) {
    result.status = 'NO_OFFERS';
    return result;
  }

  // Do not repeatedly read every X post for opportunities with an active
  // submitted/verified Post; the existing lifecycle owns those.
  const { data: existing, error: existingError } = await supabaseAdmin
    .from('reward_x_promotion_post_submissions')
    .select('invite_code')
    .in('invite_code', opportunities.map((item) => item.invite_code))
    .in('submission_state', ['PENDING', 'VERIFIED']);
  if (existingError) throw new Error('X promotion discovery submission lookup failed.');
  const alreadySubmitted = new Set(
    (existing ?? []).map((row) => row.invite_code as string),
  );
  const eligible = opportunities.filter((item) => !alreadySubmitted.has(item.invite_code));
  result.offers = eligible.length;
  if (!eligible.length) {
    result.status = 'NO_OFFERS';
    return result;
  }

  // A public share token is not proof of X account ownership. Before OAuth
  // account binding is available, only authors already bound to this wallet
  // by a completed and separately attested provider OAuth flow may be auto-submitted.
  const boundAuthors = new Map<string, string>();
  if (currentMode === 'live') {
    const { data: identities, error: identityError } = await supabaseAdmin
      .from('reward_x_promotion_oauth_proofs')
      .select('recipient_wallet,x_author_id')
      .eq('network', network)
      .in('recipient_wallet', eligible.map((item) => item.recipient_wallet));
    if (identityError) throw new Error('X promotion discovery identity lookup failed.');
    for (const identity of identities ?? []) {
      if (typeof identity.recipient_wallet === 'string' &&
          typeof identity.x_author_id === 'string' &&
          WALLET.test(identity.recipient_wallet) && POST_ID.test(identity.x_author_id)) {
        boundAuthors.set(identity.recipient_wallet.toLowerCase(), identity.x_author_id);
      }
    }
    if (!boundAuthors.size) {
      result.status = 'NO_OFFERS';
      result.offers = 0;
      return result;
    }
  }

  const oldest = Math.min(...eligible.map((item) => Date.parse(item.opened_at!)));
  // Domain-wide search is kept for existing diagnostic/legacy behavior.
  // The new author strategy requires OAuth-attested authors and an explicit
  // shared daily read budget. It has no X calls without both settings.
  const authorStrategy = currentMode === 'live' &&
    process.env.VEINVITE_X_PROMOTION_DISCOVERY_STRATEGY === 'author';
  // Autonomous rotation is opt-in, and never requests extra paid X reads.
  // These records are internal scheduling checkpoints, not user-submitted
  // evidence or an eligibility/payout decision.
  const fairScanEnabled = authorStrategy &&
    process.env.VEINVITE_X_PROMOTION_FAIR_SCAN_ENABLED === 'true';
  const lastChecked = new Map<string, string | null>();
  if (fairScanEnabled) {
    const connected = eligible.filter((item) =>
      boundAuthors.has(item.recipient_wallet.toLowerCase()));
    const { data: checkpoints, error: readError } = await supabaseAdmin
      .from('reward_x_promotion_scan_requests')
      .select('invite_code,last_checked_at')
      .eq('network', network)
      .in('invite_code', connected.map((item) => item.invite_code));
    if (readError) throw new Error('X discovery scheduling checkpoints unavailable.');
    for (const row of checkpoints ?? []) {
      if (typeof row.invite_code === 'string') {
        lastChecked.set(row.invite_code,
          typeof row.last_checked_at === 'string' ? row.last_checked_at : null);
      }
    }
    const missing = connected.filter((item) => !lastChecked.has(item.invite_code));
    if (missing.length) {
      const { error: createError } = await supabaseAdmin
        .from('reward_x_promotion_scan_requests')
        .upsert(missing.map((item) => ({
          invite_code: item.invite_code,
          network,
          recipient_wallet: item.recipient_wallet.toLowerCase(),
        })), { onConflict: 'invite_code', ignoreDuplicates: true });
      if (createError) throw new Error('X discovery scheduling checkpoint initialization failed.');
      for (const item of missing) lastChecked.set(item.invite_code, null);
    }
  }
  let search: { posts: SearchPost[]; truncated: boolean } | null = null;
  let partial = false;
  let budgetLimited = false;

  if (authorStrategy) {
    // An authenticated X author can have multiple offers; scan just once.
    const work = new Map<string, {
      openedAt: string; deadlineAt: string; inviteCodes: string[];
    }>();
    for (const offer of eligible) {
      const authorId = boundAuthors.get(offer.recipient_wallet.toLowerCase());
      if (!authorId) continue;
      const prior = work.get(authorId);
      if (prior) {
        prior.inviteCodes.push(offer.invite_code);
        if (Date.parse(offer.opened_at!) < Date.parse(prior.openedAt)) {
          prior.openedAt = offer.opened_at!;
        }
        if (Date.parse(offer.post_deadline_at) < Date.parse(prior.deadlineAt)) {
          prior.deadlineAt = offer.post_deadline_at;
        }
      } else {
        work.set(authorId, {
          openedAt: offer.opened_at!,
          deadlineAt: offer.post_deadline_at,
          inviteCodes: [offer.invite_code],
        });
      }
    }
    const authors = [...work.entries()];
    const MAX_AUTHORS_PER_TICK = 4;
    if (authors.length > MAX_AUTHORS_PER_TICK) partial = true;
    const lastAttemptTime = (codes: string[]) => Math.min(
      ...codes.map((code) => {
        const stamp = Date.parse(lastChecked.get(code) ?? '');
        return Number.isFinite(stamp) ? stamp : -1;
      }),
    );
    if (fairScanEnabled) {
      // Never attempted authors first, then least-recently-attempted authors.
      // One X author is one search, even when multiple offers share it.
      authors.sort(([idA, a], [idB, b]) =>
        lastAttemptTime(a.inviteCodes) - lastAttemptTime(b.inviteCodes) ||
        Date.parse(a.deadlineAt) - Date.parse(b.deadlineAt) ||
        idA.localeCompare(idB));
    }
    const offset = !fairScanEnabled && authors.length
      ? Math.floor(now / 3_600_000) % authors.length : 0;
    const rotated = [...authors.slice(offset), ...authors.slice(0, offset)]
      .slice(0, MAX_AUTHORS_PER_TICK);
    const posts: SearchPost[] = [];
    let checked = false;
    for (const [authorId, { openedAt, inviteCodes }] of rotated) {
      const attempt = await readBoundAuthorPosts(authorId, openedAt);
      // A completed scheduling attempt moves this author to the back even
      // when X is unavailable or the provider's author cooldown applies.
      // It never confirms a Post or authorizes payment.
      if (fairScanEnabled &&
          (attempt.status === 'READY' ||
           attempt.status === 'UNAVAILABLE' ||
           attempt.status === 'COOLDOWN')) {
        const { error: updateError } = await supabaseAdmin
          .from('reward_x_promotion_scan_requests')
          .update({ last_checked_at: new Date().toISOString() })
          .eq('network', network)
          .in('invite_code', inviteCodes);
        if (updateError) {
          throw new Error('X discovery scheduling checkpoint update failed.');
        }
      }
      if (attempt.status === 'BUDGET_LIMIT' || attempt.status === 'DISABLED') {
        budgetLimited = true;
        break;
      }
      if (attempt.status === 'COOLDOWN') continue;
      if (attempt.status !== 'READY') {
        partial = true;
        result.failed += 1;
        continue;
      }
      checked = true;
      posts.push(...attempt.posts);
      if (attempt.truncated) partial = true;
    }
    result.checked = checked;
    if (!checked) {
      result.status = budgetLimited ? 'BUDGET_LIMIT' : partial
        ? 'SEARCH_UNAVAILABLE' : 'NO_OFFERS';
      return result;
    }
    search = { posts, truncated: partial || budgetLimited };
  } else {
    // Retained for old eligibility tests and explicit legacy operation.
    // Never use this broad strategy as the basis for a new URL-less cohort.
    const searchStart = new Date(Math.max(oldest - 60_000, now - 6 * 86_400_000)).toISOString();
    search = await searchRecentPosts(searchStart);
    result.checked = true;
  }

  if (!search) {
    result.status = 'SEARCH_UNAVAILABLE';
    result.failed = 1;
    return result;
  }
  result.searched = search.posts.length;
  result.truncated = search.truncated;
  result.status = search.truncated ? 'QUERY_INCOMPLETE' : 'READY';
  const seen = new Set<string>();
  for (const post of search.posts) {
    if (!originalPublicPost(post) || seen.has(post.id!)) continue;
    seen.add(post.id!);
    const createdAt = Date.parse(post.created_at!);
    for (const opportunity of eligible) {
      if (alreadySubmitted.has(opportunity.invite_code)) continue;
      if (currentMode === 'live' &&
          boundAuthors.get(opportunity.recipient_wallet.toLowerCase()) !== post.author_id) {
        continue;
      }
      if (
        createdAt < Date.parse(opportunity.opened_at!) ||
        createdAt > Date.parse(opportunity.post_deadline_at)
      ) continue;
      const matched = findVeInvitePromotionUrl(
        expandedUrls(post), opportunity.share_token,
      );
      if (!matched) continue;
      result.matched += 1;
      if (currentMode === 'probe') {
        // Probe never changes either a reward or a verification record.
        alreadySubmitted.add(opportunity.invite_code);
        continue;
      }

      try {
        // Repeat the existing single-Post lookup so search results cannot
        // bypass the production verifier's canonical metadata checks.
        const canonical = await lookupXPromotionPost(post.id!);
        if (canonical.status !== 'FOUND' || !canonical.isOriginalPost ||
          canonical.authorId !== post.author_id ||
          canonical.createdAt !== new Date(createdAt).toISOString() ||
          !findVeInvitePromotionUrl(canonical.expandedUrls, opportunity.share_token)
        ) {
          result.ignored += 1;
          continue;
        }

        const url = `https://x.com/i/status/${canonical.postId}`;
        const { error: submitError } = await supabaseAdmin.rpc(
          'record_reward_x_promotion_post_submission_v1',
          { p_invite_code: opportunity.invite_code, p_x_post_id: canonical.postId, p_submitted_post_url: url },
        );
        if (submitError) {
          // Concurrent/manual submissions or expired opportunities are
          // expected conflicts and must not be overridden by discovery.
          if (/ALREADY|EXPIRED|NOT_HELD|MISSING|INVALID/iu.test(submitError.message)) {
            result.ignored += 1;
            continue;
          }
          throw new Error('X promotion auto submission RPC failed.');
        }
        alreadySubmitted.add(opportunity.invite_code);
        result.submitted += 1;
        // The existing lifecycle does initial and final verification, then
        // the independent payout worker verifies the on-chain settlement.
        // No direct reward or financial-state mutation is allowed here.
      } catch (caught) {
        result.failed += 1;
        console.error('X promotion discovery candidate failed', {
          inviteCode: opportunity.invite_code, error: caught,
        });
      }
    }
  }
  // Incomplete coverage is diagnostic; do not disturb legacy rewards.
  return result;
}
