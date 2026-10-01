import { NextRequest, NextResponse } from 'next/server';

import { buildNetworkCanaryFixture } from '@/lib/networkCanaryFixture';
import {
  canUseNetworkPublicLayout,
  canUseNetworkSurface,
  isNetworkCanaryWallet,
} from '@/lib/networkRuntimeServer';
import {
  NetworkLayoutRevisionConflictError,
  savePublishedNetworkLayout,
} from '@/lib/networkPublishedLayoutServer';
import { enforceRateLimits } from '@/lib/rateLimitServer';
import { normalizeAddress } from '@/lib/serverStore';
import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  requireWalletSession,
  WalletAuthenticationError,
} from '@/lib/walletAuthServer';
import type { NetworkFocusWorkspace } from '@/lib/networkWorkspace';

type PublishBody = {
  rootWallet?: string;
  focusWallet?: string;
  expectedRevision?: number;
  workspace?: NetworkFocusWorkspace;
};

type NetworkFocusPayload = {
  error?: string;
  children?: Array<{ wallet?: string }>;
};

const MAX_BODY_BYTES = 200_000;
const NETWORK_LOOKUP_TIMEOUT_MS = 5_000;
const PUBLISH_INTENT = 'publish';

function noStoreJson(
  body: Record<string, unknown>,
  status = 200,
) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function requestMayPublish(
  request: NextRequest,
): boolean {
  if (
    request.headers.get(
      'x-veinvite-layout-intent',
    ) !== PUBLISH_INTENT
  ) {
    return false;
  }

  const origin = request.headers.get('origin');
  if (!origin) {
    return true;
  }

  try {
    return (
      new URL(origin).origin ===
      request.nextUrl.origin
    );
  } catch {
    return false;
  }
}

function authErrorResponse(
  error: unknown,
): NextResponse | null {
  if (!(error instanceof WalletAuthenticationError)) {
    return null;
  }

  return noStoreJson(
    { error: error.message },
    error.status,
  );
}

async function readAllowedChildren({
  rootWallet,
  focusWallet,
}: {
  rootWallet: string;
  focusWallet: string;
}): Promise<string[]> {
  if (await isNetworkCanaryWallet(rootWallet)) {
    const payload = buildNetworkCanaryFixture(
      rootWallet,
      focusWallet,
      '',
      null,
    ) as NetworkFocusPayload;

    if (payload.error === 'FOCUS_NOT_IN_NETWORK') {
      throw new Error('FOCUS_NOT_IN_NETWORK');
    }

    return (payload.children ?? [])
      .map((child) =>
        typeof child.wallet === 'string'
          ? child.wallet.toLowerCase()
          : '',
      )
      .filter(Boolean);
  }

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    NETWORK_LOOKUP_TIMEOUT_MS,
  );

  try {
    const { data, error } = await supabaseAdmin
      .rpc('read_referral_network_focus_v2', {
        p_root_wallet: rootWallet,
        p_focus_wallet: focusWallet,
        p_search: null,
        p_round_id: null,
        p_round_start_at: null,
        p_round_end_at: null,
      })
      .abortSignal(controller.signal);

    if (error) {
      throw new Error(
        `Network focus validation failed: ${error.message}`,
      );
    }

    const payload =
      (data ?? {}) as NetworkFocusPayload;

    if (payload.error === 'FOCUS_NOT_IN_NETWORK') {
      throw new Error('FOCUS_NOT_IN_NETWORK');
    }
    if (payload.error) {
      throw new Error(payload.error);
    }

    return (payload.children ?? [])
      .map((child) =>
        typeof child.wallet === 'string'
          ? child.wallet.toLowerCase()
          : '',
      )
      .filter(Boolean);
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(
  request: NextRequest,
) {
  if (!requestMayPublish(request)) {
    return noStoreJson(
      { error: 'Invalid layout publish request.' },
      403,
    );
  }

  const rawLength = Number(
    request.headers.get('content-length') ?? 0,
  );
  if (
    Number.isFinite(rawLength) &&
    rawLength > MAX_BODY_BYTES
  ) {
    return noStoreJson(
      { error: 'Layout payload is too large.' },
      413,
    );
  }

  let body: PublishBody;
  try {
    body = (await request.json()) as PublishBody;
  } catch {
    return noStoreJson(
      { error: 'Invalid JSON body.' },
      400,
    );
  }

  let rootWallet: string;
  let focusWallet: string;
  try {
    rootWallet = normalizeAddress(
      body.rootWallet ?? '',
    );
    focusWallet = normalizeAddress(
      body.focusWallet ?? '',
    );
  } catch {
    return noStoreJson(
      { error: 'Invalid Network wallet.' },
      400,
    );
  }

  const expectedRevision =
    Number(body.expectedRevision);
  if (
    !Number.isSafeInteger(expectedRevision) ||
    expectedRevision < 0 ||
    !body.workspace ||
    typeof body.workspace !== 'object'
  ) {
    return noStoreJson(
      { error: 'Invalid layout publish payload.' },
      400,
    );
  }

  try {
    await requireWalletSession({
      request,
      expectedWallet: rootWallet,
    });
  } catch (error) {
    const response = authErrorResponse(error);
    if (response) return response;
    console.error(
      'Failed to validate Network layout wallet session:',
      error,
    );
    return noStoreJson(
      { error: 'Failed to validate wallet verification.' },
      500,
    );
  }

  const rateLimitResponse = await enforceRateLimits([
    {
      scope: 'network_layout_publish_wallet',
      subject: rootWallet,
      limit: 24,
      windowSeconds: 60,
    },
  ]);
  if (rateLimitResponse) return rateLimitResponse;

  if (
    !(await canUseNetworkSurface('my', rootWallet)) ||
    !(await canUseNetworkPublicLayout(rootWallet))
  ) {
    return noStoreJson(
      {
        code: 'PUBLIC_LAYOUT_DISABLED',
        error:
          'Public Network layout publishing is not enabled for this wallet.',
      },
      503,
    );
  }

  let allowedWallets: string[];
  try {
    allowedWallets =
      await readAllowedChildren({
        rootWallet,
        focusWallet,
      });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'FOCUS_NOT_IN_NETWORK'
    ) {
      return noStoreJson(
        {
          code: 'FOCUS_NOT_IN_NETWORK',
          error:
            'That wallet is not in your VeInvite network.',
        },
        404,
      );
    }

    console.error(
      'Failed to validate Network layout focus:',
      error,
    );
    return noStoreJson(
      {
        code: 'NETWORK_LAYOUT_VALIDATION_FAILED',
        error:
          'Failed to validate this Network layout.',
      },
      500,
    );
  }

  try {
    const snapshot =
      await savePublishedNetworkLayout({
        rootWallet,
        focusWallet,
        expectedRevision,
        workspace: body.workspace,
        allowedWallets,
        allowedSlotIds: [1, 2],
      });

    return noStoreJson({
      publishedLayout: snapshot,
    });
  } catch (error) {
    if (
      error instanceof
      NetworkLayoutRevisionConflictError
    ) {
      return noStoreJson(
        {
          code: 'LAYOUT_REVISION_CONFLICT',
          error:
            'This Network layout changed on another session.',
          currentRevision:
            error.currentRevision,
        },
        409,
      );
    }

    console.error(
      'Failed to publish Network layout:',
      error,
    );
    return noStoreJson(
      {
        code: 'NETWORK_LAYOUT_SAVE_FAILED',
        error:
          'Failed to publish this Network layout.',
      },
      500,
    );
  }
}
