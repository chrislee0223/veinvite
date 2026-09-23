import 'server-only';

import { supabaseAdmin } from '@/lib/supabaseServer';

/**
 * Sybil v2 is deployed in two phases:
 * 1) SHADOW: collect/evaluate evidence without changing participation/reward UX.
 * 2) ENFORCED: clearance/HOLD/restriction becomes authoritative.
 *
 * A lookup failure is deliberately fail-closed. Once enforcement is enabled,
 * a transient database error must never silently revert the app to legacy
 * anti-abuse behavior.
 */
export async function isSybilV2EnforcementEnabled(): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc(
    'sybil_v2_enforcement_enabled',
  );

  if (error) {
    throw new Error(
      `Sybil v2 rollout state could not be loaded: ${error.message}`,
    );
  }

  return data === true;
}
