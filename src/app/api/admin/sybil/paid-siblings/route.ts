import { NextRequest, NextResponse } from 'next/server';
import {
  canOperateVeInviteRewards,
  readVeInviteRewardPoolStatus,
} from '@/lib/rewards/onchainPool';
import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  requireWalletSession,
  WalletAuthenticationError,
} from '@/lib/walletAuthServer';

const MAX_RESULTS = 100;
const INVITE_CODE = /^[A-HJ-NP-Z2-9]{7}$/u;
const RESTRICTION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const HEADERS = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow, noarchive' };

function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try { return new URL(origin).origin === request.nextUrl.origin; }
  catch { return false; }
}

async function operatorSession(request: NextRequest) {
  const session = await requireWalletSession({ request });
  const pool = await readVeInviteRewardPoolStatus();
  if (!canOperateVeInviteRewards(session.walletAddress, pool)) {
    return { wallet: '', network: '', authorized: false };
  }
  return { wallet: session.walletAddress, network: pool.network, authorized: true };
}

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: HEADERS });
}

export async function GET(request: NextRequest) {
  try {
    const actor = await operatorSession(request);
    if (!actor.authorized) return fail('Verified operator wallet required.', 403);
    const { data, error } = await supabaseAdmin
      .from('operator_sybil_v2_paid_sibling_recheck_candidates')
      .select('network,paid_invite_code,blocked_invite_code,inviter_wallet,paid_invitee_wallet,blocked_invitee_wallet,restriction_id,shared_client_id,reward_paid_at,blocked_at,corroborating_signal_code,corroborating_evidence_at')
      .eq('network', actor.network)
      .order('blocked_at', { ascending: true })
      .limit(MAX_RESULTS);

    if (error) throw new Error(error.message);

    return NextResponse.json({
      network: actor.network,
      cases: data ?? [],
      resultLimit: MAX_RESULTS,
      observationOnly: true,
      verdictChanged: false,
    }, { headers: HEADERS });
  } catch (error) {
    if (error instanceof WalletAuthenticationError) {
      return fail(error.message, error.status);
    }
    console.error('Paid sibling review lookup failed:', error);
    return fail('Paid sibling review lookup failed.', 500);
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return fail('Invalid request origin.', 403);

  let body: unknown;
  try { body = await request.json(); }
  catch { return fail('Invalid JSON body.', 400); }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return fail('Invalid review request.', 400);
  }
  const values = body as Record<string, unknown>;
  const paidInviteCode =
    typeof values.paidInviteCode === 'string'
      ? values.paidInviteCode.trim().toUpperCase() : '';
  const restrictionId =
    typeof values.restrictionId === 'string'
      ? values.restrictionId.trim().toLowerCase() : '';
  const decision = values.decision;
  const reason =
    typeof values.reason === 'string' ? values.reason.trim() : '';
  const confirmation =
    typeof values.confirmation === 'string'
      ? values.confirmation.trim().toUpperCase() : '';

  if (
    values.intent !== 'RESOLVE_PAID_SIBLING_RECHECK' ||
    !INVITE_CODE.test(paidInviteCode) ||
    !RESTRICTION_ID.test(restrictionId) ||
    !['CLEAR','BLACKLIST'].includes(String(decision)) ||
    reason.length < 25 || reason.length > 500 ||
    confirmation !== paidInviteCode
  ) return fail('Valid case, explicit decision, 25–500 character reason and exact code confirmation required.', 400);

  try {
    const actor = await operatorSession(request);
    if (!actor.authorized) return fail('Verified operator wallet required.', 403);

    // The single DB function holds a lock, checks current evidence and
    // executes historical invalidation + recovery in one transaction.
    const { data, error } = await supabaseAdmin.rpc(
      'resolve_sybil_v2_paid_sibling_recheck', {
        p_network: actor.network,
        p_paid_invite_code: paidInviteCode,
        p_restriction_id: restrictionId,
        p_decision: decision,
        p_reason: reason,
        p_operator_wallet: actor.wallet,
      },
    );
    if (error) {
      if (/PAID_SIBLING_REVIEW_STALE|PAID_SIBLING_REVIEW_STATE_CHANGED/u.test(error.message)) {
        return fail('Review evidence or decision changed. Refresh and retry.', 409);
      }
      throw new Error(error.message);
    }

    return NextResponse.json({
      ...data,
      network: actor.network,
      transfersPerformed: false,
    }, { headers: HEADERS });
  } catch (error) {
    if (error instanceof WalletAuthenticationError) {
      return fail(error.message, error.status);
    }
    console.error('Paid sibling review resolution failed:', error);
    return fail('Paid sibling review could not be resolved.', 500);
  }
}
