import 'server-only';

const X_POST_ID_PATTERN = /^[0-9]{1,32}$/u;
const REFERRAL_KEY_PATTERN = /^(?:[A-Za-z0-9_-]{16}|[A-Za-z0-9_-]{22,64})$/u;
const PROMOTION_TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const PROMOTION_QUERY_PARAM = 'xp';
const X_API_TIMEOUT_MS = 8_000;

type XReferencedPost = {
  id?: string;
  type?: string;
};

type XUrlEntity = {
  expanded_url?: string;
  unwound_url?: string;
};

type XPostData = {
  id?: string;
  author_id?: string;
  created_at?: string;
  entities?: {
    urls?: XUrlEntity[];
  };
  referenced_tweets?: XReferencedPost[];
};

export type XPromotionPostLookup =
  | {
      status: 'FOUND';
      postId: string;
      authorId: string;
      createdAt: string;
      expandedUrls: string[];
      isOriginalPost: boolean;
    }
  | {
      status: 'NOT_FOUND';
      reason: 'POST_NOT_FOUND';
    }
  | {
      status: 'RETRY';
      reason:
        | 'X_API_NOT_CONFIGURED'
        | 'X_API_AUTH_FAILED'
        | 'X_API_RATE_LIMITED'
        | 'X_API_UNAVAILABLE'
        | 'X_API_RESPONSE_INVALID';
    };

export function parseXPostUrl(value: string): {
  postId: string;
  normalizedUrl: string;
} | null {
  let url: URL;

  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }

  if (
    url.protocol !== 'https:' ||
    !['x.com', 'www.x.com'].includes(url.hostname.toLowerCase())
  ) {
    return null;
  }

  const match =
    /^\/[^/?#]+\/status\/([0-9]{1,32})(?:\/.*)?$/u.exec(
      url.pathname,
    );

  if (!match || !X_POST_ID_PATTERN.test(match[1])) {
    return null;
  }

  return {
    postId: match[1],
    normalizedUrl: url.toString(),
  };
}

function safeExpandedUrls(data: XPostData): string[] {
  const urls = data.entities?.urls;

  if (!Array.isArray(urls)) return [];

  return Array.from(
    new Set(
      urls
        .map((item) =>
          typeof item?.expanded_url === 'string'
            ? item.expanded_url.trim()
            : '',
        )
        .filter(Boolean),
    ),
  );
}

export function findVeInvitePromotionUrl(
  expandedUrls: string[],
  shareToken: string,
): string | null {
  const token = shareToken.trim().toLowerCase();

  if (!PROMOTION_TOKEN_PATTERN.test(token)) {
    return null;
  }

  for (const candidate of expandedUrls) {
    try {
      const url = new URL(candidate);

      if (
        url.protocol !== 'https:' ||
        url.hostname.toLowerCase() !== 'veinvite.vercel.app'
      ) {
        continue;
      }

      const match =
        /^\/s\/([^/?#]+)\/?$/u.exec(url.pathname);
      if (
        !match ||
        !REFERRAL_KEY_PATTERN.test(match[1])
      ) {
        continue;
      }

      const promotionTokens =
        url.searchParams.getAll(
          PROMOTION_QUERY_PARAM,
        );

      if (
        promotionTokens.length !== 1 ||
        promotionTokens[0]?.trim().toLowerCase() !== token
      ) {
        continue;
      }

      return url.toString();
    } catch {
      // Ignore malformed X entity URLs.
    }
  }

  return null;
}

export async function lookupXPromotionPost(
  postId: string,
): Promise<XPromotionPostLookup> {
  if (!X_POST_ID_PATTERN.test(postId)) {
    return {
      status: 'RETRY',
      reason: 'X_API_RESPONSE_INVALID',
    };
  }

  const bearerToken =
    process.env.X_API_BEARER_TOKEN?.trim();

  if (!bearerToken) {
    return {
      status: 'RETRY',
      reason: 'X_API_NOT_CONFIGURED',
    };
  }

  const endpoint =
    new URL(`https://api.x.com/2/tweets/${postId}`);

  endpoint.searchParams.set(
    'tweet.fields',
    [
      'created_at',
      'entities',
      'author_id',
      'referenced_tweets',
    ].join(','),
  );

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    X_API_TIMEOUT_MS,
  );

  let response: Response;

  try {
    response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch {
    return {
      status: 'RETRY',
      reason: 'X_API_UNAVAILABLE',
    };
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 404) {
    return {
      status: 'NOT_FOUND',
      reason: 'POST_NOT_FOUND',
    };
  }

  if (response.status === 401 || response.status === 403) {
    return {
      status: 'RETRY',
      reason: 'X_API_AUTH_FAILED',
    };
  }

  if (response.status === 429) {
    return {
      status: 'RETRY',
      reason: 'X_API_RATE_LIMITED',
    };
  }

  if (!response.ok) {
    return {
      status: 'RETRY',
      reason: 'X_API_UNAVAILABLE',
    };
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    return {
      status: 'RETRY',
      reason: 'X_API_RESPONSE_INVALID',
    };
  }

  if (
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload)
  ) {
    return {
      status: 'RETRY',
      reason: 'X_API_RESPONSE_INVALID',
    };
  }

  const data =
    (payload as { data?: XPostData }).data;

  if (
    !data ||
    data.id !== postId ||
    typeof data.author_id !== 'string' ||
    !X_POST_ID_PATTERN.test(data.author_id) ||
    typeof data.created_at !== 'string' ||
    Number.isNaN(Date.parse(data.created_at))
  ) {
    return {
      status: 'RETRY',
      reason: 'X_API_RESPONSE_INVALID',
    };
  }

  return {
    status: 'FOUND',
    postId: data.id,
    authorId: data.author_id,
    createdAt: new Date(data.created_at).toISOString(),
    expandedUrls: safeExpandedUrls(data),
    isOriginalPost:
      !Array.isArray(data.referenced_tweets) ||
      data.referenced_tweets.length === 0,
  };
}
