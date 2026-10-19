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

const CODE = /^[A-HJ-NP-Z2-9]{7}$/;
const NO_STORE = { 'Cache-Control': 'no-store' };
const normalizeCode = (value: unknown): string | null =>
  typeof value === 'string' && CODE.test(value.trim().toUpperCase())
    ? value.trim().toUpperCase()
    : null;

function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}

/**
 * This is retrospective, HUMAN-APPROVED evidence, not a Sybil score.
 * A past PAID/CLEAR invitee must be the source of on-chain VTHO funding to
 * an ACTIVE restricted invitee of the SAME inviter, and linked by a verified
 * immediate same-client wallet switch. Neither signal alone suffices.
 */
async function corroboratedRestrictedPeer(
  currentCode: string, inviter: string, invitee: string, network: string,
) {
  const { data: evidence, error: evidenceError } = await supabaseAdmin
    .from('sybil_v2_evidence_records')
    .select('invite_code,signal_code')
    .eq('network', network)
    .eq('related_wallet', invitee.toLowerCase())
    .in('signal_code', [
      'SECURITY_CLIENT_SIBLING_IMMEDIATE_SWITCH',
      'FIRST_VTHO_FUNDER',
      'RECENT_PREACTIVATION_VTHO_FUNDER',
    ])
    .limit(100);
  if (evidenceError) throw new Error('Sybil evidence lookup failed.');

  const signalsByCode = new Map<string, Set<string>>();
  for (const row of evidence ?? []) {
    if (row.invite_code === currentCode) continue;
    const signals = signalsByCode.get(row.invite_code) ?? new Set<string>();
    signals.add(row.signal_code);
    signalsByCode.set(row.invite_code, signals);
  }
  const candidateCodes = [...signalsByCode]
    .filter(([, signals]) =>
      signals.has('SECURITY_CLIENT_SIBLING_IMMEDIATE_SWITCH') &&
      (signals.has('FIRST_VTHO_FUNDER') ||
       signals.has('RECENT_PREACTIVATION_VTHO_FUNDER')))
    .map(([code]) => code);

  if (!candidateCodes.length) return null;
  const [peers, restrictions] = await Promise.all([
    supabaseAdmin.from('invitations')
      .select('invite_code,inviter_wallet,invitee_wallet,activation_network')
      .in('invite_code', candidateCodes),
    supabaseAdmin.from('sybil_v2_wallet_restrictions')
      .select('related_invite_code,wallet_address')
      .eq('network', network).eq('status', 'ACTIVE')
      .is('resolved_at', null).in('related_invite_code', candidateCodes),
  ]);
  if (peers.error || restrictions.error) {
    throw new Error('Restricted peer verification failed.');
  }
  for (const peer of peers.data ?? []) {
    if (!peer.invitee_wallet ||
        peer.activation_network !== network ||
        peer.inviter_wallet.toLowerCase() !== inviter.toLowerCase()) continue;
    if (!(restrictions.data ?? []).some((item) =>
      item.related_invite_code === peer.invite_code &&
      item.wallet_address.toLowerCase() === peer.invitee_wallet.toLowerCase())) {
      continue;
    }
    return {
      peerInviteCode: peer.invite_code,
      peerWallet: peer.invitee_wallet.toLowerCase(),
      signals: [...(signalsByCode.get(peer.invite_code) ?? [])],
    };
  }
  return null;
}

async function readHistoricalCase(code: string, network: string) {
  const { data: invitation, error: invitationError } =
    await supabaseAdmin.from('invitations')
      .select('invite_code,inviter_wallet,invitee_wallet,activation_network,status,reward_status,reward_paid_at,sybil_status')
      .eq('invite_code', code).maybeSingle();
  if (invitationError) throw new Error('Invitation lookup failed.');
  if (!invitation) return null;
  if (invitation.activation_network !== network) {
    throw new Error('Operator and invitation network differ.');
  }
  const [assessment, receipt, invalidation, obligation] = await Promise.all([
    supabaseAdmin.from('sybil_v2_referral_assessments')
      .select('revision,state,source,updated_at').eq('invite_code', code).maybeSingle(),
    supabaseAdmin.from('reward_receipts')
      .select('id,amount_wei,recipient_wallet,paid_at,tx_id').eq('invite_code', code).maybeSingle(),
    supabaseAdmin.from('sybil_v2_referral_invalidations')
      .select('id,status').eq('invite_code', code).maybeSingle(),
    supabaseAdmin.from('reward_recovery_obligations')
      .select('id,status,amount_wei,recipient_wallet').eq('source_invite_code', code).maybeSingle(),
  ]);
  if (assessment.error || receipt.error || invalidation.error || obligation.error) {
    throw new Error('Historical payout and recovery lookups failed.');
  }
  const peer = invitation.invitee_wallet && invitation.status === 'COMPLETED' &&
    invitation.reward_status === 'PAID' && assessment.data?.state === 'CLEAR' &&
    invalidation.data?.status !== 'ACTIVE'
    ? await corroboratedRestrictedPeer(
        code, invitation.inviter_wallet, invitation.invitee_wallet, network,
      )
    : null;
  const canBlacklist =
    Boolean(peer) && receipt.data?.recipient_wallet?.toLowerCase() ===
      invitation.inviter_wallet.toLowerCase();
  const { data: preview, error: previewError } = await supabaseAdmin.rpc(
    'preview_sybil_v2_historical_referrals',
    { p_invite_codes: [code], p_network: network },
  );
  if (previewError) throw new Error('Historical leaderboard preview failed.');
  return {
    invitation,
    assessment: assessment.data,
    receipt: receipt.data,
    invalidation: invalidation.data,
    obligation: obligation.data,
    peer,
    canBlacklist,
    projectedLeaderboard: preview?.[0] ?? null,
  };
}

async function authorize(request: NextRequest) {
  const session = await requireWalletSession({ request });
  const pool = await readVeInviteRewardPoolStatus();
  if (!canOperateVeInviteRewards(session.walletAddress, pool)) {
    return null;
  }
  return { operator: session.walletAddress, network: pool.network };
}

function errorResponse(error: unknown) {
  if (error instanceof WalletAuthenticationError) {
    return NextResponse.json({ error: error.message }, {
      status: error.status, headers: NO_STORE,
    });
  }
  console.error('Historical paid Sybil review failed:', error);
  return NextResponse.json({
    error: error instanceof Error ? error.message :
      'Historical paid referral review failed.',
  }, { status: 500, headers: NO_STORE });
}

export async function GET(request: NextRequest) {
  try {
    const authority = await authorize(request);
    if (!authority) return NextResponse.json(
      { error: 'Verified VeInvite reward operator required.' },
      { status: 403, headers: NO_STORE },
    );
    const code = normalizeCode(request.nextUrl.searchParams.get('inviteCode'));
    if (!code) return NextResponse.json(
      { error: 'Valid 7-character invite code required.' },
      { status: 400, headers: NO_STORE },
    );
    const result = await readHistoricalCase(code, authority.network);
    if (!result) return NextResponse.json(
      { error: 'Referral not found.' }, { status: 404, headers: NO_STORE },
    );
    return NextResponse.json({ ...result, operator: authority.operator },
      { headers: NO_STORE });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json(
    { error: 'Invalid request origin.' }, { status: 403, headers: NO_STORE },
  );
  let input: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (typeof parsed !== 'object' || !parsed || Array.isArray(parsed)) {
      throw new Error('JSON object required.');
    }
    input = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body.' }, { status: 400, headers: NO_STORE },
    );
  }
  const code = normalizeCode(input.inviteCode);
  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (!code || input.intent !== 'INVALIDATE_HISTORICAL_PAID_SYBIL' ||
      input.confirmation !== code || input.decision !== 'BLACKLIST' ||
      reason.length < 24 || reason.length > 500 ||
      (typeof input.expectedRevision !== 'number' ||
       !Number.isSafeInteger(input.expectedRevision)) ||
      typeof input.expectedPaidAt !== 'string') {
    return NextResponse.json(
      { error: 'Explicit BLACKLIST decision, reason (24-500 chars), exact confirmation, revision and payout timestamp required.' },
      { status: 400, headers: NO_STORE },
    );
  }
  try {
    const authority = await authorize(request);
    if (!authority) return NextResponse.json(
      { error: 'Verified VeInvite reward operator required.' },
      { status: 403, headers: NO_STORE },
    );
    const before = await readHistoricalCase(code, authority.network);
    if (!before || !before.canBlacklist || !before.peer ||
        before.invalidation?.status === 'ACTIVE' ||
        before.assessment?.state !== 'CLEAR' ||
        Number(before.assessment.revision) !== input.expectedRevision ||
        before.invitation.reward_paid_at !== input.expectedPaidAt ||
        !before.receipt || !before.invitation.invitee_wallet) {
      return NextResponse.json(
        { error: 'Case has changed or independent restricted sibling proof is missing. Refresh and re-review.' },
        { status: 409, headers: NO_STORE },
      );
    }
    const { data: decision, error: decisionError } =
      await supabaseAdmin.rpc('resolve_sybil_v2_historical_referral', {
        p_invite_code: code,
        p_decision: 'BLACKLIST',
        p_reason: reason,
        p_operator_wallet: authority.operator,
        p_network: authority.network,
        p_case_key:
          `historical-paid:${code}:${before.peer.peerInviteCode}:${input.expectedRevision}`,
        p_reason_codes: [
          'HISTORICAL_REFERRAL_OPERATOR_BLACKLIST',
          'SECURITY_CLIENT_SIBLING_IMMEDIATE_SWITCH',
          'RECENT_PREACTIVATION_VTHO_FUNDER',
        ],
        p_evidence_summary: {
          reviewPath: 'HISTORICAL_PAID_CLEAR',
          priorAssessmentRevision: input.expectedRevision,
          restrictedPeerInviteCode: before.peer.peerInviteCode,
          peerWallet: before.peer.peerWallet,
          corroboratingSignals: before.peer.signals,
          paidAt: before.invitation.reward_paid_at,
        },
      });
    if (decisionError) throw new Error(
      `Historical referral invalidation failed: ${decisionError.message}`,
    );
    const after = await readHistoricalCase(code, authority.network);
    // A successful RPC is durable even if verification queries subsequently
    // fail. Flag partial verification rather than silently claiming success.
    const { data: recognized, error: rankError } = await supabaseAdmin
      .from('operator_referral_leaderboard')
      .select('completed_referrals')
      .eq('wallet_address', before.invitation.inviter_wallet.toLowerCase())
      .maybeSingle();
    const verified = !rankError &&
      after?.invalidation?.status === 'ACTIVE' &&
      after.obligation?.status === 'ACTIVE' &&
      after.obligation.recipient_wallet.toLowerCase() ===
        before.invitation.inviter_wallet.toLowerCase() &&
      after.obligation.amount_wei === before.receipt.amount_wei &&
      Boolean(after.receipt) &&
      recognized !== null &&
      Number(recognized.completed_referrals) ===
        Number(before.projectedLeaderboard?.projected_recognized_referrals);
    return NextResponse.json({
      changed: true,
      verified,
      reviewMode: 'HISTORICAL_PAID',
      historical: decision,
      obligation: after?.obligation ?? null,
      payoutReceiptPreserved: Boolean(after?.receipt),
      inviterRestricted: false,
      transfersPerformed: false,
      warning: verified ? null : 'Operator action may be durable; inspect invalidation and recovery ledger before retry.',
    }, { headers: NO_STORE });
  } catch (error) { return errorResponse(error); }
}
