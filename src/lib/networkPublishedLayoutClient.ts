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
const CONFLICT_PREFIX =
  'veinvite-network-public-layout-conflict-v1:';

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

function conflictStorageKey(
  wallet: string,
): string {
  return `${CONFLICT_PREFIX}${keyWallet(wallet)}`;
}

function readRevisionMapFromStorage(
  storageKey: string,
): NetworkPublishedRevisionMap {
  try {
    const raw = window.localStorage.getItem(
      storageKey,
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
        typeof revision === 'number' &&
        Number.isSafeInteger(revision) &&
        revision > 0
      ) {
        next[key] = revision;
      }
    }

    return next;
  } catch {
    return {};
  }
}

function writeRevisionMapToStorage(
  storageKey: string,
  revisions: NetworkPublishedRevisionMap,
) {
  try {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify(revisions),
    );
  } catch {
    // Local sync metadata is best-effort. Server revision checks still guard writes.
  }
}

export function readPublishedRevisionMap(
  wallet: string,
): NetworkPublishedRevisionMap {
  return readRevisionMapFromStorage(
    syncStorageKey(wallet),
  );
}

export function writePublishedRevisionMap(
  wallet: string,
  revisions: NetworkPublishedRevisionMap,
) {
  writeRevisionMapToStorage(
    syncStorageKey(wallet),
    revisions,
  );
}

export function readPublishedConflictMap(
  wallet: string,
): NetworkPublishedRevisionMap {
  return readRevisionMapFromStorage(
    conflictStorageKey(wallet),
  );
}

export function writePublishedConflictMap(
  wallet: string,
  conflicts: NetworkPublishedRevisionMap,
) {
  writeRevisionMapToStorage(
    conflictStorageKey(wallet),
    conflicts,
  );
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
          typeof payload?.currentRevision === 'number' &&
          Number.isSafeInteger(
            payload.currentRevision,
          )
            ? payload.currentRevision
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
