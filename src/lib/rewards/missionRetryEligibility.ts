import 'server-only';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { ensureSybilV2ReadyForReward } from '@/lib/sybil/v2/pipeline';
import { continueRewardReservationAfterEligibility } from '@/lib/rewards/rewardEligibilityContinuation';

/** No alternative payout path: only the canonical existing continuation. */
export async function continueCompletedRetry(network: string, code: string): Promise<void> {
  const assessment = await ensureSybilV2ReadyForReward(code);
  if (assessment.state !== 'CLEAR' || assessment.revision === null) return;
  const { data, error } = await supabaseAdmin.rpc('authorize_mission_retry_eligibility_v1', {
    p_network: network, p_invite_code: code, p_expected_revision: assessment.revision,
  });
  if (error || !data || typeof data.eligible !== 'boolean') {
    throw new Error('Retry eligibility authority failed: ' + (error?.message ?? 'malformed response'));
  }
  if (!data.eligible) return;
  await continueRewardReservationAfterEligibility(code);
}
