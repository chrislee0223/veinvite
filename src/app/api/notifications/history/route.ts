import {
  NextRequest,
  NextResponse,
} from 'next/server';

import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  requireWalletSession,
  WalletAuthenticationError,
} from '@/lib/walletAuthServer';

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 50;
const MAX_ACKNOWLEDGEMENTS = 100;
const POSITIVE_INTEGER_PATTERN = /^[1-9][0-9]*$/;

type NotificationHistoryRow = {
  id: string | number;
  invite_code: string;
  kind: string;
  stage: number;
  event_at: string;
  reward_amount_wei: string | null;
  dapp_progress: number | null;
  collapsed_progress: boolean;
  friend_wallet: string | null;
  read_at: string | null;
};

function noStoreJson(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...init?.headers,
      'Cache-Control': 'no-store',
    },
  });
}

function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;

  try {
    return new URL(origin).origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}

function walletAuthResponse(error: unknown): NextResponse | null {
  if (!(error instanceof WalletAuthenticationError)) return null;
  return noStoreJson(
    { error: error.message },
    { status: error.status },
  );
}

function parsePositiveInteger(value: unknown): string | null {
  const parsed = String(value ?? '').trim();
  if (!POSITIVE_INTEGER_PATTERN.test(parsed)) return null;

  try {
    return BigInt(parsed) > 0n ? parsed : null;
  } catch {
    return null;
  }
}

function parseLimit(value: string | null): number {
  if (!value) return DEFAULT_LIMIT;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

async function requireWallet(request: NextRequest): Promise<string> {
  const session = await requireWalletSession({ request });
  return session.walletAddress.toLowerCase();
}

export async function GET(request: NextRequest) {
  let wallet: string;
  try {
    wallet = await requireWallet(request);
  } catch (error) {
    const response = walletAuthResponse(error);
    if (response) return response;

    console.error(
      'Failed to validate notification history session:',
      error,
    );
    return noStoreJson(
      { error: 'Could not validate wallet verification.' },
      { status: 500 },
    );
  }

  const beforeRaw = request.nextUrl.searchParams.get('beforeId');
  const beforeId = beforeRaw === null
    ? null
    : parsePositiveInteger(beforeRaw);
  if (beforeRaw !== null && beforeId === null) {
    return noStoreJson(
      { error: 'Invalid notification history cursor.' },
      { status: 400 },
    );
  }
  const limit = parseLimit(request.nextUrl.searchParams.get('limit'));

  try {
    const [historyResult, unreadResult] = await Promise.all([
      supabaseAdmin.rpc('get_invite_notification_history', {
        p_inviter_wallet: wallet,
        p_before_id: beforeId,
        p_limit: limit,
      }),
      supabaseAdmin.rpc('count_invite_notification_history_unread', {
        p_inviter_wallet: wallet,
      }),
    ]);

    if (historyResult.error) {
      throw new Error(
        `Notification history could not be loaded: ${historyResult.error.message}`,
      );
    }
    if (unreadResult.error) {
      throw new Error(
        `Notification unread count could not be loaded: ${unreadResult.error.message}`,
      );
    }

    const rows = (historyResult.data ?? []) as NotificationHistoryRow[];
    const items = rows.map((row) => ({
      id: String(row.id),
      inviteCode: row.invite_code,
      kind: row.kind,
      stage: Number(row.stage),
      eventAt: row.event_at,
      rewardAmountWei: row.reward_amount_wei,
      dappProgress:
        row.dapp_progress === null ? null : Number(row.dapp_progress),
      collapsedProgress: Boolean(row.collapsed_progress),
      friendWallet: row.friend_wallet,
      readAt: row.read_at,
    }));

    return noStoreJson({
      items,
      unreadCount: Number(unreadResult.data ?? 0),
      nextCursor:
        rows.length === limit && rows.length > 0
          ? String(rows[rows.length - 1].id)
          : null,
    });
  } catch (error) {
    console.error(
      'Failed to load VeInvite notification history:',
      error,
    );
    return noStoreJson(
      { error: 'Could not load notification history.' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return noStoreJson(
      { error: 'Invalid request origin.' },
      { status: 403 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return noStoreJson(
      { error: 'Invalid JSON body.' },
      { status: 400 },
    );
  }

  const rawIds = Array.isArray(body.ids) ? body.ids : null;
  const rawThroughId = body.throughId ?? null;
  const hasIds = rawIds !== null;
  const hasThrough = rawThroughId !== null && rawThroughId !== undefined;

  if (hasIds === hasThrough) {
    return noStoreJson(
      { error: 'Choose notification ids or a through-id watermark.' },
      { status: 400 },
    );
  }

  let ids: string[] | null = null;
  let throughId: string | null = null;

  if (rawIds) {
    if (
      rawIds.length < 1 ||
      rawIds.length > MAX_ACKNOWLEDGEMENTS
    ) {
      return noStoreJson(
        { error: 'Invalid notification acknowledgement count.' },
        { status: 400 },
      );
    }

    const parsed = rawIds.map(parsePositiveInteger);
    if (parsed.some((value) => value === null)) {
      return noStoreJson(
        { error: 'Invalid notification id.' },
        { status: 400 },
      );
    }
    ids = [...new Set(parsed as string[])];
  } else {
    throughId = parsePositiveInteger(rawThroughId);
    if (!throughId) {
      return noStoreJson(
        { error: 'Invalid notification through-id.' },
        { status: 400 },
      );
    }
  }

  let wallet: string;
  try {
    wallet = await requireWallet(request);
  } catch (error) {
    const response = walletAuthResponse(error);
    if (response) return response;

    console.error(
      'Failed to validate notification history acknowledgement session:',
      error,
    );
    return noStoreJson(
      { error: 'Could not validate wallet verification.' },
      { status: 500 },
    );
  }

  try {
    const { data, error } = await supabaseAdmin.rpc(
      'acknowledge_invite_notification_history',
      {
        p_inviter_wallet: wallet,
        p_ids: ids,
        p_through_id: throughId,
      },
    );

    if (error) {
      throw new Error(
        `Notification history acknowledgement failed: ${error.message}`,
      );
    }

    return noStoreJson({
      acknowledged: true,
      result: data,
    });
  } catch (error) {
    console.error(
      'Failed to acknowledge VeInvite notification history:',
      error,
    );
    return noStoreJson(
      { error: 'Could not mark notification as read.' },
      { status: 500 },
    );
  }
}
