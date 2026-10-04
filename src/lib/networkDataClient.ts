import { normalizeNetworkWallet as keyWallet } from '@/lib/networkCanvasGeometry';
import type {
  PublishedNetworkLayoutSnapshot,
} from '@/lib/networkPublishedLayout';

export type NetworkMemberStatus =
  | 'HISTORICAL'
  | 'IN_PROGRESS'
  | 'QUALIFIED'
  | 'REWARDED';

export type NetworkChild = {
  wallet: string;
  status: NetworkMemberStatus;
  joinedAt: string | null;
  network: number;
  direct: number;
  qualified: number;
  depth: number;
};

export type NetworkSearchResult = {
  wallet: string;
  parentWallet: string | null;
  depth: number;
};

export type NetworkData = {
  rootWallet: string;
  focusWallet: string;
  focusDepth: number;
  invitedBy: string | null;
  breadcrumb: string[];
  summary: {
    network: number;
    direct: number;
    qualified: number;
    depth: number;
  };
  children: NetworkChild[];
  searchResults: NetworkSearchResult[];
  depthLimitReached: boolean;
  publishedLayout?: PublishedNetworkLayoutSnapshot | null;
  publicLayoutPublishingEnabled?: boolean;
};

export function provisionalNetworkData(wallet: string): NetworkData {
  return {
    rootWallet: wallet,
    focusWallet: wallet,
    focusDepth: 0,
    invitedBy: null,
    breadcrumb: [wallet],
    summary: {
      network: 0,
      direct: 0,
      qualified: 0,
      depth: 0,
    },
    children: [],
    searchResults: [],
    depthLimitReached: false,
    publishedLayout: null,
    publicLayoutPublishingEnabled: false,
  };
}

export async function fetchNetwork(
  rootWallet: string,
  options: {
    focus?: string;
    query?: string;
    signal?: AbortSignal;
  } = {},
): Promise<NetworkData> {
  const params = new URLSearchParams({ wallet: rootWallet });

  if (
    options.focus &&
    keyWallet(options.focus) !== keyWallet(rootWallet)
  ) {
    params.set('focus', options.focus);
  }

  if (options.query) {
    params.set('q', options.query);
  }

  const response = await fetch(
    `/api/network?${params.toString()}`,
    {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: options.signal,
    },
  );

  const payload = await response
    .json()
    .catch(() => null) as
      | NetworkData
      | { error?: string }
      | null;

  if (!response.ok) {
    const message =
      payload &&
      'error' in payload &&
      payload.error
        ? payload.error
        : 'Failed to load network.';

    throw new Error(message);
  }

  if (
    !payload ||
    !('rootWallet' in payload) ||
    !payload.rootWallet ||
    !payload.focusWallet ||
    !payload.summary ||
    !Array.isArray(payload.children) ||
    !Array.isArray(payload.breadcrumb)
  ) {
    throw new Error('Network response was incomplete.');
  }

  return payload as NetworkData;
}
