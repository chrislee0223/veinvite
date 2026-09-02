import {
  NextRequest,
  NextResponse,
} from 'next/server';

import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  requireWalletSession,
  WalletAuthenticationError,
} from '@/lib/walletAuthServer';

const INVITE_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{7}$/;
const INELIGIBLE_ACK_STAGE = 1;

type IneligibleInviteRow = {
  invite_code: string;
  ineligible_at: string | null;
  updated_at: string;
};

type NotificationStateRow = {
  invite_code: string;
  highest_stage: number;
};

function noStoreJson(
  body: unknown,
  init?: ResponseInit,
) {
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

function walletAuthResponse(
  error: unknown,
): NextResponse | null {
  if (error instanceof WalletAuthenticationError) {
    return noStoreJson(
      { error: error.message },
      { status: error.status },
    );
  }

  return null;
}

export async function GET(request: NextRequest) {
  let wallet: string;

  try {
    const session = await requireWalletSession({ request });
    wallet = session.walletAddress.toLowerCase();
  } catch (error) {
    const response = walletAuthResponse(error);
    if (response) return response;

    console.error(
      'Failed to validate ineligible-invite notification session:',
      error,
    );
    return noStoreJson(
      { error: 'Could not validate wallet verification.' },
      { status: 500 },
    );
  }

  try {
    const invitationResult = await supabaseAdmin
      .from('invitations')
      .select('invite_code, ineligible_at, updated_at')
      .eq('inviter_wallet', wallet)
      .not('ineligibility_check_id', 'is', null)
      .order('ineligible_at', {
        ascending: false,
        nullsFirst: false,
      })
      .limit(50);

    if (invitationResult.error) {
      throw new Error(
        `Ineligible invitations could not be loaded: ${invitationResult.error.message}`,
      );
    }

    const invitations =
      (invitationResult.data ?? []) as IneligibleInviteRow[];
    const inviteCodes = invitations.map(
      (invitation) => invitation.invite_code,
    );

    if (inviteCodes.length === 0) {
      return noStoreJson({
        notification: null,
        unreadCount: 0,
      });
    }

    const stateResult = await supabaseAdmin
      .from('invite_notification_state')
      .select('invite_code, highest_stage')
      .eq('inviter_wallet', wallet)
      .in('invite_code', inviteCodes);

    if (stateResult.error) {
      throw new Error(
        `Ineligible notification state could not be loaded: ${stateResult.error.message}`,
      );
    }

    const acknowledged = new Map(
      ((stateResult.data ?? []) as NotificationStateRow[]).map(
        (state) => [
          state.invite_code,
          Number(state.highest_stage) || 0,
        ],
      ),
    );

    const unread = invitations.filter(
      (invitation) =>
        (acknowledged.get(invitation.invite_code) ?? 0) <
        INELIGIBLE_ACK_STAGE,
    );
    const selected = unread[0] ?? null;

    return noStoreJson({
      notification: selected
        ? {
            inviteCode: selected.invite_code,
            kind: 'INVITE_INELIGIBLE',
            eventAt:
              selected.ineligible_at ?? selected.updated_at,
          }
        : null,
      unreadCount: unread.length,
    });
  } catch (error) {
    console.error(
      'Failed to load ineligible invite notifications:',
      error,
    );
    return noStoreJson(
      { error: 'Could not load notifications.' },
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

  let body: { inviteCode?: unknown };
  try {
    body = (await request.json()) as {
      inviteCode?: unknown;
    };
  } catch {
    return noStoreJson(
      { error: 'Invalid JSON body.' },
      { status: 400 },
    );
  }

  const inviteCode = String(body.inviteCode ?? '')
    .trim()
    .toUpperCase();

  if (!INVITE_CODE_PATTERN.test(inviteCode)) {
    return noStoreJson(
      { error: 'Invalid notification acknowledgement.' },
      { status: 400 },
    );
  }

  let wallet: string;
  try {
    const session = await requireWalletSession({ request });
    wallet = session.walletAddress.toLowerCase();
  } catch (error) {
    const response = walletAuthResponse(error);
    if (response) return response;

    console.error(
      'Failed to validate ineligible notification acknowledgement:',
      error,
    );
    return noStoreJson(
      { error: 'Could not validate wallet verification.' },
      { status: 500 },
    );
  }

  try {
    const invitationResult = await supabaseAdmin
      .from('invitations')
      .select('invite_code, ineligibility_check_id')
      .eq('invite_code', inviteCode)
      .eq('inviter_wallet', wallet)
      .not('ineligibility_check_id', 'is', null)
      .maybeSingle();

    if (invitationResult.error) {
      throw new Error(
        `Ineligible notification invitation could not be loaded: ${invitationResult.error.message}`,
      );
    }

    if (!invitationResult.data) {
      return noStoreJson(
        { error: 'Notification not found.' },
        { status: 404 },
      );
    }

    const { data, error } = await supabaseAdmin.rpc(
      'acknowledge_invite_notification',
      {
        p_invite_code: inviteCode,
        p_inviter_wallet: wallet,
        p_stage: INELIGIBLE_ACK_STAGE,
      },
    );

    if (error) {
      throw new Error(
        `Ineligible notification acknowledgement failed: ${error.message}`,
      );
    }

    return noStoreJson({
      acknowledged: true,
      state: data,
    });
  } catch (error) {
    console.error(
      'Failed to acknowledge ineligible invite notification:',
      error,
    );
    return noStoreJson(
      { error: 'Could not mark notification as read.' },
      { status: 500 },
    );
  }
}
