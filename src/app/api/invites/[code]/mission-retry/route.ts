import { NextRequest, NextResponse } from 'next/server';

import { enforceRateLimits, getClientIpSubject } from '@/lib/rateLimitServer';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { readVeBetterRoundWindow } from '@/lib/vebetter/entryEligibility';
import { requireWalletSession, WalletAuthenticationError } from '@/lib/walletAuthServer';

const CODE_PATTERN = /^[A-HJ-NP-Z2-9]{7}$/;
const noCache = { 'Cache-Control': 'no-store' } as const;

type Context = { params: Promise<{ code: string }> };
type MissionInvite = {
  invite_code: string;
  inviter_wallet: string;
  invitee_wallet: string | null;
  status: string;
  reward_status: string;
  activation_network: string | null;
};
type RetryState = {
  state: string;
  restartEligible: boolean;
  currentRoundId?: number | null;
};

function authError(error: unknown): NextResponse {
  if (error instanceof WalletAuthenticationError) {
    return NextResponse.json(
      { outcome: 'wallet_verification_failed' },
      { status: error.status, headers: noCache },
    );
  }
  console.error('Mission retry wallet session error:', error);
  return NextResponse.json(
    { outcome: 'server_error' }, { status: 500, headers: noCache },
  );
}

async function loadAuthorizedInvite(
  request: NextRequest,
  context: Context,
  inviteeOnly: boolean,
): Promise<
  { ok: true; invitation: MissionInvite; sessionWallet: string } |
  { ok: false; response: NextResponse }
> {
  const { code: rawCode } = await context.params;
  const code = rawCode.toUpperCase();
  if (!CODE_PATTERN.test(code)) {
    return { ok: false, response: NextResponse.json(
      { outcome: 'invalid_invitation' }, { status: 404, headers: noCache }) };
  }
  let sessionWallet: string;
  try {
    const session = await requireWalletSession({ request });
    sessionWallet = session.walletAddress.toLowerCase();
  } catch (error) {
    return { ok: false, response: authError(error) };
  }
  const { data, error } = await supabaseAdmin.from('invitations')
    .select('invite_code,inviter_wallet,invitee_wallet,status,reward_status,activation_network')
    .eq('invite_code', code).maybeSingle();
  if (error) {
    console.error('Mission retry invite lookup failed:', error);
    return { ok: false, response: NextResponse.json(
      { outcome: 'temporary_error' }, { status: 503, headers: noCache }) };
  }
  if (!data || !data.invitee_wallet) {
    return { ok: false, response: NextResponse.json(
      { outcome: 'invalid_invitation' }, { status: 404, headers: noCache }) };
  }
  const row = data as MissionInvite;
  const isInvitee = row.invitee_wallet?.toLowerCase() === sessionWallet;
  const isInviter = row.inviter_wallet.toLowerCase() === sessionWallet;
  if (!(isInvitee || (!inviteeOnly && isInviter))) {
    return { ok: false, response: NextResponse.json(
      { outcome: 'wallet_mismatch' }, { status: 403, headers: noCache }) };
  }
  return { ok: true, invitation: row, sessionWallet };
}

async function readState(row: MissionInvite): Promise<RetryState> {
  if (!row.activation_network) throw new Error('Invitation network not known');
  const { data, error } = await supabaseAdmin.rpc(
    'read_invitation_mission_retry_state_v1', {
      p_invite_code: row.invite_code, p_network: row.activation_network,
    });
  if (error || !data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Mission retry authority unavailable: ' + (error?.message ?? 'bad result'));
  }
  const state = data as Record<string, unknown>;
  if (typeof state.state !== 'string' ||
      typeof state.restartEligible !== 'boolean') {
    throw new Error('Mission retry authority malformed');
  }
  return state as RetryState;
}

/** Authenticated, owner-scoped lifecycle status. No scanning, writes, or notifications. */
export async function GET(request: NextRequest, context: Context) {
  const loaded = await loadAuthorizedInvite(request, context, false);
  if (!loaded.ok) return loaded.response;
  try {
    const mission = await readState(loaded.invitation);
    return NextResponse.json({ mission }, { headers: noCache });
  } catch (error) {
    console.error('Mission retry state read failed:', error);
    return NextResponse.json(
      { outcome: 'temporary_error' }, { status: 503, headers: noCache },
    );
  }
}

/**
 * Future-only operation. Two independent rollout gates:
 * 1) server release flag (default off), 2) atomic DB setting (default off).
 * This endpoint does NOT reset canonical invitation or payout evidence.
 */
export async function POST(request: NextRequest, context: Context) {
  const loaded = await loadAuthorizedInvite(request, context, true);
  if (!loaded.ok) return loaded.response;
  if (process.env.VEINVITE_MISSION_RETRY_READY !== 'true') {
    return NextResponse.json(
      { outcome: 'retry_not_live' }, { status: 409, headers: noCache },
    );
  }
  const { invitation, sessionWallet } = loaded;
  const ip = getClientIpSubject(request);
  const rateLimit = await enforceRateLimits([
    { scope: 'mission_retry_invitee', subject: sessionWallet, limit: 5, windowSeconds: 300 },
    { scope: 'mission_retry_code', subject: invitation.invite_code, limit: 5, windowSeconds: 300 },
    ip ? { scope: 'mission_retry_ip', subject: ip, limit: 20, windowSeconds: 300 } : null,
  ]);
  if (rateLimit) return rateLimit;

  try {
    const state = await readState(invitation);
    if (state.state !== 'EXPIRED' || !state.restartEligible) {
      return NextResponse.json(
        { outcome: 'retry_not_available', state: state.state },
        { status: 409, headers: noCache },
      );
    }

    // All round information comes from the reviewed VeChain onchain reader,
    // never from request parameters or the wallet's untrusted browser.
    const round = await readVeBetterRoundWindow();
    if (round.network !== invitation.activation_network ||
        round.status !== 'ACTIVE') {
      return NextResponse.json(
        { outcome: 'round_not_ready' },
        { status: 409, headers: noCache },
      );
    }

    const { data, error } = await supabaseAdmin.rpc('begin_invitation_mission_retry_v1', {
      p_invite_code: invitation.invite_code,
      p_network: round.network,
      p_round_id: round.roundId,
      p_start_block: round.bestBlock,
      p_round_start_block: round.voteStartBlock,
      p_round_end_block: round.voteEndBlock,
    });
    if (error || !data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('Atomic mission retry rejected: ' + (error?.message ?? 'bad result'));
    }
    const result = data as Record<string, unknown>;
    if (result.started !== true) {
      return NextResponse.json(
        { outcome: 'retry_not_available', reason: result.reason ?? 'UNKNOWN' },
        { status: 409, headers: noCache },
      );
    }
    if (!Number.isSafeInteger(Number(result.attemptNo)) ||
        !Number.isSafeInteger(Number(result.voteRoundId))) {
      throw new Error('Mission retry result is missing canonical attempt identity');
    }
    return NextResponse.json(
      { outcome: 'mission_restarted',
        attemptNo: result.attemptNo, dappRoundId: result.dappRoundId,
        voteRoundId: result.voteRoundId },
      { status: 201, headers: noCache },
    );
  } catch (error) {
    console.error('Mission retry activation unavailable:', error);
    return NextResponse.json(
      { outcome: 'temporary_error' }, { status: 503, headers: noCache },
    );
  }
}
