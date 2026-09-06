import 'server-only';

import { supabaseAdmin } from '@/lib/supabaseServer';

export const SYBIL_BEHAVIOR_FINGERPRINT_VERSION = 'behavior-v1';

export type SybilBehaviorObservationSummary = {
  enabled: boolean;
  fingerprintVersion: string;
  comparedPairs: number;
  watchCandidates: number;
  highestObservationScore: number;
};

function observationEnabled() {
  return process.env.SYBIL_OBSERVATION_ENABLED === 'true';
}

export async function runSybilBehaviorObservation(): Promise<SybilBehaviorObservationSummary> {
  const disabled: SybilBehaviorObservationSummary = {
    enabled: false,
    fingerprintVersion: SYBIL_BEHAVIOR_FINGERPRINT_VERSION,
    comparedPairs: 0,
    watchCandidates: 0,
    highestObservationScore: 0,
  };

  if (!observationEnabled()) {
    return disabled;
  }

  const [allPairs, watchPairs, highest] = await Promise.all([
    supabaseAdmin
      .from('operator_sybil_behavior_similarity_candidates')
      .select('invite_a', { count: 'exact', head: true }),
    supabaseAdmin
      .from('operator_sybil_behavior_similarity_candidates')
      .select('invite_a', { count: 'exact', head: true })
      .eq('attention_level', 'WATCH'),
    supabaseAdmin
      .from('operator_sybil_behavior_similarity_candidates')
      .select('observation_score')
      .order('observation_score', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (allPairs.error) {
    throw new Error(
      `Could not count behavior fingerprint pairs: ${allPairs.error.message}`,
    );
  }

  if (watchPairs.error) {
    throw new Error(
      `Could not count behavior WATCH candidates: ${watchPairs.error.message}`,
    );
  }

  if (highest.error) {
    throw new Error(
      `Could not load behavior observation score: ${highest.error.message}`,
    );
  }

  const highestObservationScore =
    typeof highest.data?.observation_score === 'number'
      ? highest.data.observation_score
      : 0;

  return {
    enabled: true,
    fingerprintVersion: SYBIL_BEHAVIOR_FINGERPRINT_VERSION,
    comparedPairs: allPairs.count ?? 0,
    watchCandidates: watchPairs.count ?? 0,
    highestObservationScore,
  };
}
