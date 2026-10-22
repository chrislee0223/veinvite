import 'server-only';

import { createHash, randomUUID } from 'node:crypto';

import { supabaseAdmin } from '@/lib/supabaseServer';

export type XApiReadKind = 'TIMELINE' | 'POST_LOOKUP' | 'OAUTH_USER';
const COST_MILLIUSD: Record<XApiReadKind, number> = {
  TIMELINE: 60, // at most 10 returned Posts + one expanded User
  POST_LOOKUP: 15, // one returned Post + possible expanded User
  OAUTH_USER: 10, // one returned User
};

/**
 * Reserve the maximum possible X API read cost *before* sending any request.
 * Conservatively counts repeated reads and failed requests, and is atomic
 * across Vercel instances. DB enforces $5/month with <=$3 on discovery.
 *
 * This is an application guard, not the developer account's provider-native
 * spending limit; other apps, external calls, and provider price changes are
 * outside its control.
 */
export async function reserveXApiReadBudget(kind: XApiReadKind): Promise<boolean> {
  const cost = COST_MILLIUSD[kind];
  const requestHash = createHash('sha256')
    .update(`veinvite-x-api-read-v1:${kind}:${randomUUID()}`)
    .digest('hex');
  try {
    const { data, error } = await supabaseAdmin.rpc(
      'reserve_reward_x_promotion_api_budget_v1',
      {
        p_request_hash: requestHash,
        p_cost_milliusd: cost,
        p_request_kind: kind,
      },
    ).abortSignal(AbortSignal.timeout(8_000));
    if (error || typeof data !== 'boolean') {
      console.error('X API monthly budget reservation unavailable', {
        kind,
        reason: error?.code ?? 'INVALID_RESPONSE',
      });
      return false;
    }
    return data;
  } catch {
    return false;
  }
}
