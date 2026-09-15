import { createHash, timingSafeEqual } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

import { recoverSubmittedRewardPayout } from '@/lib/rewards/submittedPayoutRecovery';
import { supabaseAdmin } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';

const TOKEN_HASH = 'deacc475de86747bb57afd3f0c6a80848ef0e1af83e8fedd34e28645646ba367';
const TARGET_INVITE_CODE = '7ACQA43';
const TARGET_ROUND_ID = 16;
const TARGET_MANIFEST_ID = 31;
const TARGET_TX_ID =
  '0x2464c53607adcf47cb777c22afb208a82649ebe7adfab573ccbdba42fb6dc0cc';

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

async function readTargetState() {
  const [invitationResult, payoutResult, submissionResult, settlementResult, activeRoundResult] =
    await Promise.all([
      supabaseAdmin
        .from('invitations')
        .select('invite_code, reward_status, reward_paid_at')
        .eq('invite_code', TARGET_INVITE_CODE)
        .maybeSingle(),
      supabaseAdmin
        .from('reward_payouts')
        .select('id, round_id, invite_code, status, tx_id, paid_at')
        .eq('invite_code', TARGET_INVITE_CODE)
        .maybeSingle(),
      supabaseAdmin
        .from('reward_payout_transaction_submissions')
        .select('manifest_id, round_id, tx_id, registered_at')
        .eq('manifest_id', TARGET_MANIFEST_ID)
        .maybeSingle(),
      supabaseAdmin
        .from('reward_payout_transaction_settlements')
        .select('manifest_id, tx_id, paid_at, verified_at')
        .eq('manifest_id', TARGET_MANIFEST_ID)
        .maybeSingle(),
      supabaseAdmin
        .from('reward_rounds')
        .select('id, status')
        .in('status', ['CREATED', 'PAYING'])
        .order('id', { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);

  for (const [label, result] of [
    ['invitation', invitationResult],
    ['payout', payoutResult],
    ['submission', submissionResult],
    ['settlement', settlementResult],
    ['active round', activeRoundResult],
  ] as const) {
    if (result.error) {
      throw new Error(
        `Round 16 recovery ${label} state could not be read: ${result.error.message}`,
      );
    }
  }

  return {
    invitation: invitationResult.data,
    payout: payoutResult.data,
    submission: submissionResult.data,
    settlement: settlementResult.data,
    activeRound: activeRoundResult.data,
  };
}

function targetStateMatches(state: Awaited<ReturnType<typeof readTargetState>>) {
  return Boolean(
    state.invitation?.invite_code === TARGET_INVITE_CODE &&
      state.payout?.invite_code === TARGET_INVITE_CODE &&
      Number(state.payout?.round_id) === TARGET_ROUND_ID &&
      state.submission?.manifest_id === TARGET_MANIFEST_ID &&
      Number(state.submission?.round_id) === TARGET_ROUND_ID &&
      String(state.submission?.tx_id ?? '').toLowerCase() === TARGET_TX_ID &&
      Number(state.activeRound?.id) === TARGET_ROUND_ID,
  );
}

/**
 * One-time guarded recovery entrypoint for the already-submitted Round 16
 * payout that predates durable Queue continuation. This route can only call
 * recoverSubmittedRewardPayout(), which cannot prepare, sign, or broadcast a
 * replacement transaction. Exact invite/round/manifest/tx journal identity is
 * verified before the recovery worker can run.
 */
export async function GET(request: NextRequest) {
  if (process.env.VERCEL_ENV !== 'production') {
    return noStoreJson({ error: 'Production only.' }, 404);
  }

  if (!authorized(request)) {
    return noStoreJson({ error: 'Unauthorized.' }, 401);
  }

  try {
    const before = await readTargetState();

    if (before.settlement) {
      return noStoreJson({
        status: 'ALREADY_SETTLED',
        inviteCode: TARGET_INVITE_CODE,
        txId: TARGET_TX_ID,
        paidAt: before.settlement.paid_at,
      });
    }

    if (!targetStateMatches(before)) {
      console.error('Round 16 guarded recovery preflight mismatch.', before);
      return noStoreJson(
        { error: 'Guarded Round 16 recovery preflight failed.' },
        409,
      );
    }

    if (
      before.payout?.status !== 'PENDING' ||
      before.invitation?.reward_status !== 'ELIGIBLE'
    ) {
      return noStoreJson(
        { error: 'Target payout is not in the expected pending state.' },
        409,
      );
    }

    const recovery = await recoverSubmittedRewardPayout();
    const after = await readTargetState();

    return noStoreJson({
      status: recovery.status,
      inviteCode: TARGET_INVITE_CODE,
      roundId: recovery.roundId,
      manifestId: recovery.manifestId,
      txId: recovery.txId,
      reason: recovery.reason ?? null,
      settled: Boolean(after.settlement),
      payoutStatus: after.payout?.status ?? null,
      rewardStatus: after.invitation?.reward_status ?? null,
      paidAt:
        after.settlement?.paid_at ??
        after.payout?.paid_at ??
        after.invitation?.reward_paid_at ??
        null,
    });
  } catch (error) {
    console.error('Guarded Round 16 recovery failed:', error);
    return noStoreJson(
      { error: 'Guarded Round 16 recovery failed.' },
      500,
    );
  }
}
