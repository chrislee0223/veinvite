// Shared, read-only current-cohort estimate reader for API and first HTML paint.
// Never use historical per-person forecast fields or payout writers.
import { supabaseAdmin } from '@/lib/supabaseServer';
import { VEINVITE_APP_ID } from '@/lib/rewards/onchainPool';
import {
  ACTIVE_WINDOW_MS,
  countActiveSharedPoolReferrals,
  estimateActiveSharedPoolReward,
  estimatePolicyAwareActiveSharedPoolReward,
  type ActiveReferralForecastRow,
} from '@/lib/rewards/activeSharedPoolForecast';

export type ElasticPublicPreview =
  | { mode: 'LEGACY' | 'PENDING' }
  | { mode: 'ELASTIC_SCENARIOS';
      oneWinnerWei: string; twoWinnersWei: string; threeWinnersWei: string;
      acceptedParticipants: number; rewardCohortRoundId: number; observedAt: string;
      xOptionReservePerWinnerWei: string;
      activeParticipants: number; projectedRecipients: number;
      displayEstimateWei: string };

export async function readElasticPublicPreview(network: string, signal?: AbortSignal): Promise<ElasticPublicPreview | null> {
  if (process.env.VEINVITE_ELASTIC_COHORT_ENABLED !== 'true') return null;
  try {
    const rpc = supabaseAdmin.rpc(
      'read_reward_elastic_public_scenarios_v1',
      { p_network: network, p_app_id: VEINVITE_APP_ID },
    );
    const { data, error } = await (signal ? rpc.abortSignal(signal) : rpc);
    if (error) throw new Error(error.message);
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('Invalid elastic preview response.');
    }
    const x = data as Record<string, unknown>;
    if (x.mode === 'PENDING' || x.mode === 'LEGACY') return { mode: x.mode };
    const values = [x.oneWinnerWei, x.twoWinnersWei, x.threeWinnersWei,
      x.xOptionReservePerWinnerWei];
    if (x.mode !== 'ELASTIC_SCENARIOS' ||
        !values.every((v) => typeof v === 'string' && /^\d+$/.test(v)) ||
        !Number.isSafeInteger(x.acceptedParticipants) ||
        !Number.isSafeInteger(x.rewardCohortRoundId) ||
        typeof x.observedAt !== 'string' ||
        Number.isNaN(Date.parse(x.observedAt))) {
      throw new Error('Malformed elastic reward preview.');
    }
    // Count recent accepted invitations (including 0 missions), never
    // hypothetical new users, plus completed unpaid users in this vote round.
    // One bounded, read-only PostgREST snapshot keeps public display separate
    // from settlement. Older invitees still retain their real payout rights.
    const nowMs = Date.now();
    const cutoffIso = new Date(nowMs - ACTIVE_WINDOW_MS).toISOString();
    const roundId = Number(x.rewardCohortRoundId);
    // PostgREST logical-filter values containing ":" / "." (ISO timestamps)
    // must be quoted, then URL-encoded by supabase-js.
    const quotedCutoff = `"${cutoffIso}"`;
    const boundedFilter =
      `and(status.eq.ACTIVATING,activated_at.gte.${quotedCutoff}),` +
      `and(status.eq.COMPLETED,vote_round_id.eq.${roundId})`;
    const activityQuery = supabaseAdmin
      .from('invitations')
      .select(
        'invite_code,created_at,status,sybil_status,reward_status,ineligible_at,apps_completed,activated_at,apps_completed_at,vote_completed_at,vote_round_id,slot_released_at',
      )
      .eq('activation_network', network)
      .is('ineligible_at', null)
      // The canonical reservation trigger and full-offset settlement release
      // the slot atomically. Do not divide free capacity by fixed recipients.
      .is('slot_released_at', null)
      .or(boundedFilter)
      .limit(1000);
    const { data: activeRows, error: activeError } = await (
      signal ? activityQuery.abortSignal(signal) : activityQuery
    );
    if (activeError || !activeRows || activeRows.length === 1000) {
      throw new Error(
        activeError?.message ?? 'Public reward activity sample unavailable',
      );
    }
    let forecastRows = activeRows as ActiveReferralForecastRow[];
    if (process.env.VEINVITE_MISSION_AUTO_RESET_READY === 'true') {
      const query = supabaseAdmin.rpc('read_mission_retry_forecast_rows_v1', {
        p_network: network, p_round_id: roundId,
      });
      const result = await (signal ? query.abortSignal(signal) : query);
      if (result.error || !Array.isArray(result.data) || result.data.length >= 1000) {
        throw new Error('Retry participation estimate unavailable');
      }
      const byCode = new Map(forecastRows.map(row => [row.invite_code, row]));
      for (const row of result.data as ActiveReferralForecastRow[]) {
        if (!row.invite_code || row.retry_active !== true) throw new Error('Invalid retry forecast row');
        byCode.set(row.invite_code, row);
      }
      forecastRows = [...byCode.values()];
    }
    const activeParticipants = countActiveSharedPoolReferrals(
      forecastRows,
      roundId,
      nowMs,
    );
    // Database-first rollout: before the policy-aware SQL migration, retain
    // the historical forecast. After migration, reject incomplete private
    // metadata instead of silently deducting the legacy reserve for everyone.
    const policyAware = 'capacityBeforeNewXWei' in x;
    const projected = policyAware
      ? (() => {
          if (typeof x.capacityBeforeNewXWei !== 'string' ||
              typeof x.legacyXReservePerWinnerWei !== 'string' ||
              typeof x.prospectiveXReservePerWinnerWei !== 'string' ||
              !/^\d+$/.test(x.prospectiveXReservePerWinnerWei) ||
              !(x.promotionPolicyCutoverAt === null || typeof x.promotionPolicyCutoverAt === 'string') ||
              !(x.promotionPolicySunsetAt === null || typeof x.promotionPolicySunsetAt === 'string')) {
            throw new Error('Malformed private policy-aware forecast');
          }
          return estimatePolicyAwareActiveSharedPoolReward(
            x.capacityBeforeNewXWei,
            x.legacyXReservePerWinnerWei,
            forecastRows,
            roundId,
            nowMs,
            x.promotionPolicyCutoverAt,
            x.promotionPolicySunsetAt,
          );
        })()
      : estimateActiveSharedPoolReward(
          String(x.oneWinnerWei),
          String(x.xOptionReservePerWinnerWei),
          activeParticipants,
        );
    const prospectiveReserve = policyAware
      ? String(x.prospectiveXReservePerWinnerWei) : String(x.xOptionReservePerWinnerWei);
    const hypotheticalQuote = (recipients: bigint, original: unknown) => {
      if (!policyAware) return String(original);
      const available = BigInt(String(x.capacityBeforeNewXWei))-recipients*BigInt(prospectiveReserve);
      return (available>0n ? available/recipients : 0n).toString();
    };
    return {
      mode: 'ELASTIC_SCENARIOS',
      oneWinnerWei: hypotheticalQuote(1n,x.oneWinnerWei),
      twoWinnersWei: hypotheticalQuote(2n,x.twoWinnersWei),
      threeWinnersWei: hypotheticalQuote(3n,x.threeWinnersWei),
      acceptedParticipants: Number(x.acceptedParticipants),
      rewardCohortRoundId: Number(x.rewardCohortRoundId),
      observedAt: x.observedAt,
      xOptionReservePerWinnerWei: prospectiveReserve,
      activeParticipants,
      projectedRecipients: projected.projectedRecipients,
      displayEstimateWei: projected.estimatedRewardWei,
    };
  } catch (error) {
    if (!signal?.aborted) console.error('Elastic reward preview unavailable:', error);
    return { mode: 'PENDING' };
  }
}

