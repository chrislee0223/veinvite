import { createHash, timingSafeEqual } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

import { runAutomaticRewardPayout } from '@/lib/rewards/automaticRewardPayoutWithMnemonic';
import { supabaseAdmin } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';

const TOKEN_HASH = 'e59d6ad17d88a7d5bd276e29b8901fc6ab1a2f2a89506ef77843f00ecf30defb';
const TARGET_RECIPIENT = '0x69d3e60f17f101cc188b4120a4a64593228b4efa';
const TARGETS = new Map([
  ['EALXSC8', '191252137695939519768'],
  ['QNU8TDF', '191252137695939519742'],
]);

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function secureEquals(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function authorized(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') ?? '';
  if (!/^[0-9a-f]{64}$/i.test(token)) return false;
  const hash = createHash('sha256').update(token).digest('hex');
  return secureEquals(hash, TOKEN_HASH);
}

function targetAmount(inviteCode: string) {
  return TARGETS.get(inviteCode) ?? null;
}

/**
 * Temporary, token-protected recovery entrypoint for two rewards whose explicit
 * Claim was durably recorded before the Claim-immediate-retry fix reached
 * Production. This route never creates a custom transfer. It only re-enters the
 * normal automatic payout worker after proving that all currently queued work
 * belongs to the exact two pre-verified claimed reservations below. Remove this
 * route immediately after both rewards have finalized.
 */
export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return noStoreJson({ error: 'Unauthorized.' }, 401);
  }

  const [queueResult, targetQueueResult, invitationResult, payoutResult] =
    await Promise.all([
      supabaseAdmin
        .from('reward_queue_entries')
        .select('invite_code, recipient_wallet, status, reserved_amount_wei, claim_requested_at, claim_requested_by_wallet, assigned_round_id')
        .eq('network', 'mainnet')
        .eq('status', 'QUEUED'),
      supabaseAdmin
        .from('reward_queue_entries')
        .select('invite_code, recipient_wallet, status, reserved_amount_wei, claim_requested_at, claim_requested_by_wallet, assigned_round_id')
        .eq('network', 'mainnet')
        .eq('recipient_wallet', TARGET_RECIPIENT)
        .in('invite_code', [...TARGETS.keys()])
        .in('status', ['QUEUED', 'ASSIGNED']),
      supabaseAdmin
        .from('invitations')
        .select('invite_code, inviter_wallet, status, reward_status, reward_paid_at, sybil_status, identity_link_status')
        .in('invite_code', [...TARGETS.keys()]),
      supabaseAdmin
        .from('reward_payouts')
        .select('id, round_id, invite_code, recipient_wallet, amount_wei, status, tx_id, paid_at')
        .in('invite_code', [...TARGETS.keys()]),
    ]);

  for (const [label, result] of [
    ['queue', queueResult],
    ['target queue', targetQueueResult],
    ['invitation', invitationResult],
    ['payout', payoutResult],
  ] as const) {
    if (result.error) {
      return noStoreJson({ error: `${label} state could not be verified.` }, 500);
    }
  }

  const invitations = invitationResult.data ?? [];
  if (invitations.length !== TARGETS.size) {
    return noStoreJson({ error: 'Target invitation set is incomplete.' }, 409);
  }

  for (const invitation of invitations) {
    if (
      !TARGETS.has(invitation.invite_code) ||
      invitation.inviter_wallet.toLowerCase() !== TARGET_RECIPIENT ||
      invitation.status !== 'COMPLETED' ||
      !['ELIGIBLE', 'PAID'].includes(invitation.reward_status) ||
      invitation.sybil_status !== 'CLEAR' ||
      !['NO_KNOWN_LINK', 'OPERATOR_CLEARED'].includes(invitation.identity_link_status)
    ) {
      return noStoreJson({ error: 'Target invitation is not safe to recover.' }, 409);
    }
  }

  const payouts = payoutResult.data ?? [];
  if (
    payouts.some((row) =>
      !TARGETS.has(row.invite_code) ||
      row.recipient_wallet.toLowerCase() !== TARGET_RECIPIENT ||
      String(row.amount_wei) !== targetAmount(row.invite_code),
    )
  ) {
    return noStoreJson({ error: 'Unexpected target payout state.' }, 409);
  }

  if (
    payouts.length === TARGETS.size &&
    payouts.every((row) => row.status === 'PAID' && row.tx_id && row.paid_at)
  ) {
    return noStoreJson({
      status: 'ALREADY_PAID',
      payouts,
      transfersPerformed: false,
    });
  }

  const targetQueue = targetQueueResult.data ?? [];
  if (targetQueue.length !== TARGETS.size) {
    return noStoreJson({ error: 'Target claimed queue state is incomplete.' }, 409);
  }

  for (const row of targetQueue) {
    if (
      !TARGETS.has(row.invite_code) ||
      row.recipient_wallet.toLowerCase() !== TARGET_RECIPIENT ||
      String(row.reserved_amount_wei) !== targetAmount(row.invite_code) ||
      !row.claim_requested_at ||
      row.claim_requested_by_wallet?.toLowerCase() !== TARGET_RECIPIENT
    ) {
      return noStoreJson({ error: 'Target claimed reservation does not match.' }, 409);
    }
  }

  const queued = queueResult.data ?? [];
  if (
    queued.some((row) =>
      !TARGETS.has(row.invite_code) ||
      row.recipient_wallet.toLowerCase() !== TARGET_RECIPIENT,
    )
  ) {
    return noStoreJson({ error: 'Another claimed reward is queued; recovery refused.' }, 409);
  }

  try {
    const payout = await runAutomaticRewardPayout();
    return noStoreJson({ status: 'RECOVERY_ITERATION_COMPLETE', payout });
  } catch (error) {
    console.error('Claimed reward recovery failed:', error);
    return noStoreJson({ error: 'Claimed reward recovery iteration failed.' }, 500);
  }
}
