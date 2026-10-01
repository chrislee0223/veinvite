import type {
  PublishedNetworkLayoutSnapshot,
} from '@/lib/networkPublishedLayout';
import type {
  NetworkFocusWorkspace,
} from '@/lib/networkWorkspace';
import {
  normalizeNetworkWallet as keyWallet,
} from '@/lib/networkCanvasGeometry';

const SYNC_PREFIX =
  'veinvite-network-public-layout-sync-v1:';

export type NetworkPublishedRevisionMap =
  Record<string, number>;

export class NetworkLayoutPublishError extends Error {
  readonly code: string | null;
  readonly currentRevision: number | null;

  constructor(
    message: string,
    {
      code = null,
      currentRevision = null,
    }: {
      code?: string | null;
      currentRevision?: number | null;
    } = {},
  ) {
    super(message);
    this.name = 'NetworkLayoutPublishError';
    this.code = code;
    this.currentRevision = currentRevision;
  }
}

function syncStorageKey(
  wallet: string,
): string {
  return `${SYNC_PREFIX}${keyWallet(wallet)}`;
}

export function readPublishedRevisionMap(
  wallet: string,
): NetworkPublishedRevisionMap {
  try {
    const raw = window.localStorage.getItem(
      syncStorageKey(wallet),
    );
    if (!raw) return {};

    const parsed = JSON.parse(raw) as
      Record<string, unknown>;
    const next: NetworkPublishedRevisionMap = {};

    for (const [focus, revision] of
      Object.entries(parsed)) {
      const key = keyWallet(focus);
      if (
        /^0x[0-9a-f]{40}$/u.test(key) &&
        Number.isSafeInteger(revision) &&
        Number(revision) > 0
      ) {
        next[key] = Number(revision);
      }
    }

    return next;
  } catch {
    return {};
  }
}

export function writePublishedRevisionMap(
  wallet: string,
  revisions: NetworkPublishedRevisionMap,
) {
  try {
    window.localStorage.setItem(
      syncStorageKey(wallet),
      JSON.stringify(revisions),
    );
  } catch {
    // Revision persistence is best-effort. The server still protects writes
    // with optimistic concurrency.
  }
}

export async function publishNetworkLayout({
  rootWallet,
  focusWallet,
  expectedRevision,
  workspace,
  signal,
}: {
  rootWallet: string;
  focusWallet: string;
  expectedRevision: number;
  workspace: NetworkFocusWorkspace;
  signal?: AbortSignal;
}): Promise<PublishedNetworkLayoutSnapshot> {
  const response = await fetch(
    '/api/network/layout',
    {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'x-veinvite-layout-intent': 'publish',
      },
      body: JSON.stringify({
        rootWallet,
        focusWallet,
        expectedRevision,
        workspace,
      }),
      signal,
    },
  );

  const payload = await response
    .json()
    .catch(() => null) as
      | {
          publishedLayout?:
            PublishedNetworkLayoutSnapshot;
          code?: string;
          error?: string;
          currentRevision?: number;
        }
      | null;

  if (!response.ok) {
    throw new NetworkLayoutPublishError(
      payload?.error ??
        'Failed to publish Network layout.',
      {
        code: payload?.code ?? null,
        currentRevision:
          Number.isSafeInteger(
            payload?.currentRevision,
          )
            ? Number(payload?.currentRevision)
            : null,
      },
    );
  }

  if (
    !payload?.publishedLayout ||
    !Number.isSafeInteger(
      payload.publishedLayout.revision,
    )
  ) {
    throw new NetworkLayoutPublishError(
      'Network layout publish response was incomplete.',
    );
  }

  return payload.publishedLayout;
}
