import 'server-only';

import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  getAdmissionRolloutStart,
  maybeReserveFundedReferralMinimumAfterActivation,
} from '@/lib/rewards/admissionGuaranteeActivation';
import { getVeBetterNetworkConfig } from '@/lib/vebetter/network';

export type AdmissionFinalityRetryResult = {
  attempted: number;
  held: number;
  deferred: number;
  errors: number;
};

/**
 * Operates within the existing 5-minute recovery lease. Both the server
 * rollout opt-in and the DB policy must be enabled before reading candidates.
 * No promises are made; only the canonical service-side reservation RPC can
 * create an actual HELD liability.
 */
export async function retryAdmissionGuaranteesAfterFinality():
Promise<AdmissionFinalityRetryResult> {
  const result: AdmissionFinalityRetryResult = {
    attempted: 0, held: 0, deferred: 0, errors: 0,
  };
  if (process.env.VEINVITE_ADMISSION_GUARANTEE_ENABLED !== 'true') return result;
  const rollout = getAdmissionRolloutStart();
  if (!rollout) return result;

  const { network } = getVeBetterNetworkConfig();
  const { data: policy, error: policyError } = await supabaseAdmin.rpc(
    'read_reward_admission_hold_for_reservation_v1',
    { p_network: network, p_invite_code: 'ADMISSION-ROLLOUT-PROBE' },
  );
  if (policyError || !policy || typeof policy !== 'object' ||
      Array.isArray(policy)) {
    throw new Error('Admission retry policy reader unavailable.');
  }
  if ((policy as Record<string, unknown>).admissionEnabled !== true) {
    return result;
  }

  // Bounded candidate scan. The financial RPC checks every status, budget,
  // chain proof and duplicate again under the payout lock.
  const { data, error } = await supabaseAdmin.from('invitations')
    .select('invite_code')
    .eq('activation_network', network)
    .gte('activated_at', rollout)
    .in('status', ['ACTIVATING', 'UNDER_REVIEW'])
    .in('sybil_status', ['NOT_CHECKED', 'CLEAR'])
    .not('eligibility_check_id', 'is', null)
    .not('activation_block', 'is', null)
    .is('slot_released_at', null)
    .is('reward_eligible_at', null)
    .order('activated_at', { ascending: true })
    .limit(72);
  if (error) throw new Error('Admission retry candidate scan unavailable.');

  const codes = (data ?? [])
    .map((row) => row.invite_code)
    .filter((code): code is string =>
      typeof code === 'string' && /^[A-Z0-9-]{6,48}$/.test(code));
  if (codes.length === 0) return result;

  // Rotate across bounded pages so an old unresolved invite cannot starve
  // every later invite. No new cron or paid external service is created.
  const pageSize = 6;
  const pages = Math.ceil(codes.length / pageSize);
  const page = Math.floor(Date.now() / 300_000) % pages;
  for (const code of codes.slice(page * pageSize, (page + 1) * pageSize)) {
    result.attempted += 1;
    try {
      const outcome = await maybeReserveFundedReferralMinimumAfterActivation({
        inviteCode: code, network,
      });
      if (outcome === 'HELD') result.held += 1;
      else result.deferred += 1;
    } catch (error) {
      result.errors += 1;
      console.error('Finality admission retry failed without payout:', {
        inviteCode: code, error,
      });
    }
  }
  return result;
}
