import { NextRequest, NextResponse } from 'next/server';

import {
  canOperateVeInviteRewards,
  readVeInviteRewardPoolStatus,
} from '@/lib/rewards/onchainPool';
import { enforceRateLimits } from '@/lib/rateLimitServer';
import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  requireWalletSession,
  WalletAuthenticationError,
} from '@/lib/walletAuthServer';

export const dynamic = 'force-dynamic';

const INTENT = 'CLOSE_SYBIL_APPEAL';
const HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function reply(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, { status, headers: HEADERS });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (!origin || origin !== request.nextUrl.origin) {
    return reply({ error: 'Invalid request origin.' }, 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return reply({ error: 'Invalid JSON.' }, 400);
  }
  if (!body || typeof body !== 'object') {
    return reply({ error: 'Invalid appeal request.' }, 400);
  }
  const data = body as Record<string, unknown>;
  const appealId = data.appealId;
  const revision = data.expectedRevision;
  const outcome = data.outcome;
  const reason = data.reason;

  if (
    data.intent !== INTENT ||
    typeof appealId !== 'string' || !UUID.test(appealId) ||
    typeof revision !== 'number' || !Number.isSafeInteger(revision) ||
    revision < 1 ||
    (outcome !== 'UPHELD_RESTRICTION' && outcome !== 'CASE_VERDICT_CHANGED') ||
    typeof reason !== 'string' ||
    reason.trim().length < 25 || reason.trim().length > 600
  ) {
    return reply({ error: 'Invalid disposition details.' }, 400);
  }

  try {
    const session = await requireWalletSession({ request });
    const pool = await readVeInviteRewardPoolStatus();
    if (!canOperateVeInviteRewards(session.walletAddress, pool)) {
      return reply({ error: 'Operator wallet required.' }, 403);
    }

    const throttle = await enforceRateLimits([{
      scope: 'sybil_appeal_operator_close',
      subject: session.walletAddress,
      limit: 30,
      windowSeconds: 3600,
    }]);
    if (throttle) return throttle;

    const { data: result, error } = await supabaseAdmin.rpc(
      'close_sybil_v2_owner_appeal',
      {
        p_appeal_id: appealId,
        p_network: pool.network,
        p_expected_revision: revision,
        p_operator_wallet: session.walletAddress,
        p_outcome: outcome,
        p_reason: reason.trim(),
      },
    );

    if (error) {
      if (
        /SYBIL_APPEAL_(ALREADY_RESOLVED|STATE_CHANGED|CASE_CHANGED|VERDICT_NOT_CHANGED|NOT_FOUND)/u
          .test(error.message)
      ) {
        return reply({
          error: 'Appeal or Sybil verdict changed. Reload before closing.',
        }, 409);
      }
      throw new Error('Operator appeal closure persistence failed.');
    }

    const record = Array.isArray(result) ? result[0] : result;
    if (!record || record.closed !== true ||
        record.final_status !== 'RESOLVED') {
      throw new Error('Appeal closure result invalid.');
    }

    return reply({
      closed: true,
      status: 'RESOLVED',
      verdictUnchanged: true,
      rewardUnchanged: true,
      restrictionUnchanged: true,
    });
  } catch (error) {
    if (error instanceof WalletAuthenticationError) {
      return reply({ error: error.message }, error.status);
    }
    console.error('Failed to close operator appeal:', error);
    return reply({ error: 'Unable to close review request.' }, 503);
  }
}
