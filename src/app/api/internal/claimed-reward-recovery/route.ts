import { createHash, timingSafeEqual } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

import { runAutomaticRewardPayout } from '@/lib/rewards/automaticRewardPayoutWithMnemonic';
import { supabaseAdmin } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';

const TOKEN_HASH = 'e59d6ad17d88a7d5bd276e29b8901fc6ab1a2f2a89506ef77843f00ecf30defb';
const TARGET_INVITE_CODES = ['EALXSC8', 'QNU8TDF'] as const;

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

/**
 * Temporary, token-protected recovery entrypoint for two rewards whose explicit
 * Claim was durably recorded before the Claim-immediate-retry fix reached
 * Production. Exact wallet, amount, claim, eligibility and queue checks are
 * performed inside Postgres so 21-digit wei values never cross a JavaScript
 * Number boundary before validation. This route never creates a custom transfer;
 * it only re-enters the normal automatic payout worker after exact DB preflight.
 * Remove this route and its verifier immediately after both rewards finalize.
 */
export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return noStoreJson({ error: 'Unauthorized.' }, 401);
  }

  const preflight = await supabaseAdmin.rpc(
    'verify_two_claimed_reward_recovery_exactly',
  );

  if (preflight.error || preflight.data !== true) {
    console.error(
      'Exact claimed reward recovery preflight failed:',
      preflight.error,
    );
    return noStoreJson(
      { error: 'Claimed reward recovery safety preflight failed.' },
      409,
    );
  }

  const payoutResult = await supabaseAdmin
    .from('reward_payouts')
    .select('id, round_id, invite_code, recipient_wallet, amount_wei, status, tx_id, paid_at')
    .in('invite_code', TARGET_INVITE_CODES);

  if (payoutResult.error) {
    return noStoreJson({ error: 'Target payout state could not be verified.' }, 500);
  }

  const payouts = payoutResult.data ?? [];
  if (
    payouts.length === TARGET_INVITE_CODES.length &&
    payouts.every((row) => row.status === 'PAID' && row.tx_id && row.paid_at)
  ) {
    return noStoreJson({
      status: 'ALREADY_PAID',
      payouts,
      transfersPerformed: false,
    });
  }

  try {
    const payout = await runAutomaticRewardPayout();
    return noStoreJson({ status: 'RECOVERY_ITERATION_COMPLETE', payout });
  } catch (error) {
    console.error('Claimed reward recovery failed:', error);
    return noStoreJson({ error: 'Claimed reward recovery iteration failed.' }, 500);
  }
}
