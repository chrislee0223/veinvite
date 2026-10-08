import 'server-only';

import { supabaseAdmin } from '@/lib/supabaseServer';

type ReviewedSiblingPatternRpcResult = {
  changed?: boolean;
  state?: string;
  revision?: number | string;
  reason?: string;
};

export type ReviewedSiblingRestrictionResult = {
  restricted: boolean;
  revision: number | string | null;
};

export async function applyReviewedSiblingSyncRewardRestriction({
  inviteCode,
  network,
  expectedRevision,
}: {
  inviteCode: string;
  network: string;
  expectedRevision: number;
}): Promise<ReviewedSiblingRestrictionResult> {
  const { data, error } = await supabaseAdmin.rpc(
    'apply_sybil_v2_security_client_sibling_pattern_restriction',
    {
      p_invite_code: inviteCode,
      p_expected_revision: expectedRevision,
      p_network: network,
    },
  );

  if (error) {
    throw new Error(
      `Reviewed sibling-pattern restriction could not be applied: ${error.message}`,
    );
  }

  const result = (data ?? {}) as ReviewedSiblingPatternRpcResult;
  if (result.changed === true && result.state === 'RESTRICTED') {
    return {
      restricted: true,
      revision: result.revision ?? expectedRevision,
    };
  }

  // A concurrent assessment pass may win after the RPC's revision check.
  // Read back the authoritative state before deciding the pattern did not apply.
  const { data: current, error: currentError } = await supabaseAdmin
    .from('sybil_v2_referral_assessments')
    .select('state,revision')
    .eq('invite_code', inviteCode)
    .maybeSingle();

  if (currentError) {
    throw new Error(
      `Reviewed sibling-pattern assessment refresh failed: ${currentError.message}`,
    );
  }

  return {
    restricted: current?.state === 'RESTRICTED',
    revision: current?.revision ?? result.revision ?? expectedRevision,
  };
}
