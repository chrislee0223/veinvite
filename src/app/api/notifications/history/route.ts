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
const INTERNAL_WATCH_KIND = 'SECURITY_INVITER_WATCH';
const INTERNAL_WATCH_PAGE_SIZE = 500;

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

type NotificationHistoryDedupeRow = {
  id: string | number;
  dedupe_key: string;
};

type NotificationHistoryIdRow = {
  id: string | number;
};

const PRESENTATION_KIND_FALLBACKS: Record<string, string> = {
  SECURITY_POST_PAYOUT_REVIEW_STARTED: 'SECURITY_REVIEW_STARTED',
  SECURITY_POST_PAYOUT_REVIEW_CLEARED: 'SECURITY_INVITER_ACCESS_RESTORED',
  SECURITY_REFERRAL_RESTORED: 'SECURITY_INVITER_ACCESS_RESTORED',
};

function compatibleHistoryKind(kind: string): string {
  return PRESENTATION_KIND_FALLBACKS[kind] ?? kind;
}

function presentationHistoryKind(
  kind: string,
  dedupeKey: string | null,
): string {
  if (
    kind === 'SECURITY_REVIEW_STARTED' &&
    dedupeKey?.includes(':SECURITY_REVIEW_STARTED:postpayout-r')
  ) {
    return 'SECURITY_POST_PAYOUT_REVIEW_STARTED';
  }

  if (
    kind === 'SECURITY_INVITER_ACCESS_RESTORED' &&
    dedupeKey?.includes(
      ':SECURITY_INVITER_ACCESS_RESTORED:postpayout-clear-r',
    )
  ) {
    return 'SECURITY_POST_PAYOUT_REVIEW_CLEARED';
  }

  return kind;
}

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

async function loadHistoryRowsWithoutInternalWatch({
  wallet,
  beforeId,
  limit,
}: {
  wallet: string;
  beforeId: string | null;
  limit: number;
}): Promise<{
  rows: NotificationHistoryRow[];
  hasMore: boolean;
}> {
  const visibleRows: NotificationHistoryRow[] = [];
  let cursor = beforeId;
  let exhausted = false;

  while (visibleRows.length <= limit && !exhausted) {
    const historyResult = await supabaseAdmin.rpc(
      'get_invite_notification_history',
      {
        p_inviter_wallet: wallet,
        p_before_id: cursor,
        p_limit: MAX_LIMIT,
      },
    );

    if (historyResult.error) {
      throw new Error(
        `Notification history could not be loaded: ${historyResult.error.message}`,
      );
    }

    const batch = (historyResult.data ?? []) as NotificationHistoryRow[];
    visibleRows.push(
      ...batch.filter((row) => row.kind !== INTERNAL_WATCH_KIND),
    );

    if (batch.length < MAX_LIMIT) {
      exhausted = true;
      break;
    }

    const nextCursor = String(batch[batch.length - 1]?.id ?? '');
    if (!nextCursor || nextCursor === cursor) {
      exhausted = true;
      break;
    }
    cursor = nextCursor;
  }

  return {
    rows: visibleRows.slice(0, limit),
    hasMore: visibleRows.length > limit || !exhausted,
  };
}

async function loadInternalWatchIdsForWallet(
  wallet: string,
): Promise<string[]> {
  const ids = new Set<string>();

  const loadScope = async (
    scope: 'recipient' | 'legacy',
  ): Promise<void> => {
    let from = 0;

    while (true) {
      let query = supabaseAdmin
        .from('invite_notification_history')
        .select('id')
        .eq('kind', INTERNAL_WATCH_KIND)
        .order('id', { ascending: true })
        .range(from, from + INTERNAL_WATCH_PAGE_SIZE - 1);

      query = scope === 'recipient'
        ? query.eq('recipient_wallet', wallet)
        : query.is('recipient_wallet', null).eq('inviter_wallet', wallet);

      const result = await query;
      if (result.error) {
        throw new Error(
          `Internal notification history could not be counted: ${result.error.message}`,
        );
      }

      const batch = (result.data ?? []) as NotificationHistoryIdRow[];
      for (const row of batch) ids.add(String(row.id));

      if (batch.length < INTERNAL_WATCH_PAGE_SIZE) break;
      from += INTERNAL_WATCH_PAGE_SIZE;
    }
  };

  await Promise.all([
    loadScope('recipient'),
    loadScope('legacy'),
  ]);

  return [...ids];
}

async function countUnreadInternalWatch(
  wallet: string,
): Promise<number> {
  const ids = await loadInternalWatchIdsForWallet(wallet);
  if (ids.length === 0) return 0;

  const readIds = new Set<string>();

  for (let start = 0; start < ids.length; start += INTERNAL_WATCH_PAGE_SIZE) {
    const batchIds = ids.slice(start, start + INTERNAL_WATCH_PAGE_SIZE);
    const readResult = await supabaseAdmin
      .from('invite_notification_history_reads')
      .select('notification_id')
      .eq('inviter_wallet', wallet)
      .in('notification_id', batchIds);

    if (readResult.error) {
      throw new Error(
        `Internal notification read state could not be counted: ${readResult.error.message}`,
      );
    }

    for (const row of (readResult.data ?? []) as Array<{
      notification_id: string | number;
    }>) {
      readIds.add(String(row.notification_id));
    }
  }

  return ids.length - readIds.size;
}

async function visibleUnreadCount(
  wallet: string,
  totalUnread: number,
): Promise<number> {
  if (totalUnread < 1) return 0;
  const hiddenUnread = await countUnreadInternalWatch(wallet);
  return Math.max(0, totalUnread - hiddenUnread);
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
    // A verified payout receipt is the source of truth for paid alerts.
    // Reconcile only on first-page history reads; failures must not hide
    // previously recorded notifications or affect reward accounting.
    if (beforeId === null) {
      const { error: reconciliationError } = await supabaseAdmin.rpc(
        'reconcile_verified_paid_reward_history',
        { p_inviter_wallet: wallet },
      );
      if (reconciliationError) {
        console.error(
          'Receipt-verified paid notification reconciliation failed:',
          reconciliationError.message,
        );
      }
    }

    const [historyPage, unreadResult] = await Promise.all([
      loadHistoryRowsWithoutInternalWatch({
        wallet,
        beforeId,
        limit,
      }),
      supabaseAdmin.rpc('count_invite_notification_history_unread', {
        p_inviter_wallet: wallet,
      }),
    ]);

    if (unreadResult.error) {
      throw new Error(
        `Notification unread count could not be loaded: ${unreadResult.error.message}`,
      );
    }

    const rows = historyPage.rows.slice(0, limit);
    const legacySecurityIds = rows
      .filter(
        (row) =>
          row.kind === 'SECURITY_REVIEW_STARTED' ||
          row.kind === 'SECURITY_INVITER_ACCESS_RESTORED',
      )
      .map((row) => String(row.id));

    const dedupeKeyById = new Map<string, string>();
    if (legacySecurityIds.length > 0) {
      const dedupeResult = await supabaseAdmin
        .from('invite_notification_history')
        .select('id,dedupe_key')
        .eq('inviter_wallet', wallet)
        .in('id', legacySecurityIds);

      if (dedupeResult.error) {
        throw new Error(
          `Notification security context could not be loaded: ${dedupeResult.error.message}`,
        );
      }

      for (const row of (dedupeResult.data ?? []) as NotificationHistoryDedupeRow[]) {
        dedupeKeyById.set(String(row.id), row.dedupe_key);
      }
    }

    const restrictedCodes = [...new Set(rows
      .filter((row) => row.kind === 'SECURITY_RESTRICTION_CONFIRMED')
      .map((row) => row.invite_code))];
    const inviterByCode = new Map<string, string>();
    if (restrictedCodes.length > 0) {
      const rolesResult = await supabaseAdmin
        .from('invitations')
        .select('invite_code,inviter_wallet')
        .in('invite_code', restrictedCodes);
      if (rolesResult.error) {
        throw new Error(`Notification recipient role lookup failed: ${rolesResult.error.message}`);
      }
      for (const invitation of rolesResult.data ?? []) {
        inviterByCode.set(invitation.invite_code, invitation.inviter_wallet.toLowerCase());
      }
    }

    const items = rows.map((row) => {
      const rawKind = row.kind;
      const presentationKind = presentationHistoryKind(
        rawKind,
        dedupeKeyById.get(String(row.id)) ?? null,
      );

      return {
        id: String(row.id),
        inviteCode: row.invite_code,
        kind: compatibleHistoryKind(rawKind),
        recipientRole: rawKind === 'SECURITY_RESTRICTION_CONFIRMED'
          ? inviterByCode.get(row.invite_code) === wallet ? 'inviter' : 'invitee'
          : undefined,
        presentationKind,
        stage: Number(row.stage),
        eventAt: row.event_at,
        rewardAmountWei: row.reward_amount_wei,
        dappProgress:
          row.dapp_progress === null ? null : Number(row.dapp_progress),
        collapsedProgress: Boolean(row.collapsed_progress),
        friendWallet: row.friend_wallet,
        readAt: row.read_at,
      };
    });

    const unreadCount = await visibleUnreadCount(
      wallet,
      Number(unreadResult.data ?? 0),
    );

    return noStoreJson({
      items,
      unreadCount,
      nextCursor:
        historyPage.hasMore && rows.length > 0
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
    if (ids) {
      const paidResult = await supabaseAdmin
        .from('invite_notification_history')
        .select('id')
        .eq('inviter_wallet', wallet)
        .in('id', ids)
        .eq('kind', 'REWARD_PAID')
        .limit(1);

      if (paidResult.error) {
        throw new Error(
          `Paid notification acknowledgement guard failed: ${paidResult.error.message}`,
        );
      }
      if ((paidResult.data ?? []).length > 0) {
        return noStoreJson(
          { error: 'Paid reward notifications must be acknowledged from the reward receipt.' },
          { status: 400 },
        );
      }
    }

    const acknowledgementResult = await supabaseAdmin.rpc(
      'acknowledge_invite_notification_history',
      {
        p_inviter_wallet: wallet,
        p_ids: ids,
        p_through_id: throughId,
      },
    );

    if (acknowledgementResult.error) {
      throw new Error(
        `Notification history acknowledgement failed: ${acknowledgementResult.error.message}`,
      );
    }

    const unreadResult = await supabaseAdmin.rpc(
      'count_invite_notification_history_unread',
      {
        p_inviter_wallet: wallet,
      },
    );

    if (unreadResult.error) {
      throw new Error(
        `Notification unread count could not be refreshed: ${unreadResult.error.message}`,
      );
    }

    return noStoreJson({
      acknowledged: true,
      result: acknowledgementResult.data,
      unreadCount: await visibleUnreadCount(
        wallet,
        Number(unreadResult.data ?? 0),
      ),
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