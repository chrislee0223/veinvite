import { createHash, timingSafeEqual } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

import { runAutomaticRewardPayout } from '@/lib/rewards/automaticRewardPayoutWithMnemonic';
import { supabaseAdmin } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';

const TOKEN_SHA256 = '031568ec8f19cd0176bc3c45443d6be64a037eb0edf90688628f14c118f13d52';
const TARGET_INVITE_CODE = '4JDJXVC';
const TARGET_RECIPIENT = '0x0533410815b0bb452362f91c6c9d1d64abf2c295';
const TARGET_AMOUNT_WEI = '191252137695939520698';

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function hasValidToken(request: NextRequest): boolean {
  const token = request.nextUrl.searchParams.get('token') ?? '';
  const actual = createHash('sha256').update(token).digest();
  const expected = Buffer.from(TOKEN_SHA256, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function matchesTarget(row: { invite_code?: unknown; recipient_wallet?: unknown }) {
  return (
    String(row.invite_code ?? '') === TARGET_INVITE_CODE &&
    String(row.recipient_wallet ?? '').toLowerCase() === TARGET_RECIPIENT
  );
}

/**
 * Temporary, token-protected recovery route for the first Production reward.
 * It may only operate while every active reward row belongs to the single
 * pre-verified target invitation. The exact 256-bit-sized reward amount is
 * filtered by Postgres instead of being round-tripped through JavaScript,
 * avoiding numeric precision loss. The real transfer is delegated to the
 * normal automatic payout worker so all existing lock, journal, manifest and
 * finality protections remain authoritative. Delete this route after recovery.
 */
export async function GET(request: NextRequest) {
  if (!hasValidToken(request)) {
    return noStoreJson({ error: 'Unauthorized.' }, 401);
  }

  const [
    invitationResult,
    queueResult,
    exactTargetQueueResult,
    payoutResult,
    receiptResult,
  ] = await Promise.all([
    supabaseAdmin
      .from('invitations')
      .select('invite_code, inviter_wallet, status, reward_status, reward_paid_at, sybil_status, identity_link_status')
      .eq('invite_code', TARGET_INVITE_CODE)
      .maybeSingle(),
    supabaseAdmin
      .from('reward_queue_entries')
      .select('invite_code, recipient_wallet, status, assigned_round_id')
      .in('status', ['QUEUED', 'ASSIGNED']),
    supabaseAdmin
      .from('reward_queue_entries')
      .select('invite_code, recipient_wallet, status, assigned_round_id')
      .eq('invite_code', TARGET_INVITE_CODE)
      .eq('recipient_wallet', TARGET_RECIPIENT)
      .eq('reserved_amount_wei', TARGET_AMOUNT_WEI)
      .in('status', ['QUEUED', 'ASSIGNED']),
    supabaseAdmin
      .from('reward_payouts')
      .select('invite_code, recipient_wallet, status, tx_id'),
    supabaseAdmin
      .from('reward_receipts')
      .select('invite_code, recipient_wallet, amount_wei, tx_id, paid_at')
      .eq('invite_code', TARGET_INVITE_CODE),
  ]);

  for (const [label, result] of [
    ['invitation', invitationResult],
    ['queue', queueResult],
    ['exact target queue', exactTargetQueueResult],
    ['payout', payoutResult],
    ['receipt', receiptResult],
  ] as const) {
    if (result.error) {
      return noStoreJson({ error: `${label} state could not be verified.` }, 500);
    }
  }

  const receipts = receiptResult.data ?? [];
  if (receipts.length > 0) {
    const receipt = receipts[0];
    if (!matchesTarget(receipt)) {
      return noStoreJson({ error: 'Unexpected receipt state.' }, 409);
    }
    return noStoreJson({ status: 'ALREADY_PAID', receipt, transfersPerformed: false });
  }

  const invitation = invitationResult.data;
  if (
    !invitation ||
    invitation.inviter_wallet.toLowerCase() !== TARGET_RECIPIENT ||
    invitation.status !== 'COMPLETED' ||
    invitation.reward_status !== 'ELIGIBLE' ||
    invitation.reward_paid_at !== null ||
    invitation.sybil_status !== 'CLEAR' ||
    !['NO_KNOWN_LINK', 'OPERATOR_CLEARED'].includes(invitation.identity_link_status)
  ) {
    return noStoreJson({ error: 'Target invitation is not safe to pay.' }, 409);
  }

  const activeQueue = queueResult.data ?? [];
  const exactTargetQueue = exactTargetQueueResult.data ?? [];
  if (
    activeQueue.length !== 1 ||
    !matchesTarget(activeQueue[0]) ||
    exactTargetQueue.length !== 1 ||
    !matchesTarget(exactTargetQueue[0])
  ) {
    return noStoreJson({ error: 'Active queue is not exclusively the exact target reward.' }, 409);
  }

  const payouts = payoutResult.data ?? [];
  if (payouts.some((row) => !matchesTarget(row))) {
    return noStoreJson({ error: 'Another payout exists; recovery refused.' }, 409);
  }

  try {
    const payout = await runAutomaticRewardPayout();
    return noStoreJson({ status: 'RECOVERY_ITERATION_COMPLETE', payout });
  } catch (error) {
    console.error('Token-protected first reward recovery failed:', error);
    return noStoreJson({ error: 'Reward recovery iteration failed.' }, 500);
  }
}
