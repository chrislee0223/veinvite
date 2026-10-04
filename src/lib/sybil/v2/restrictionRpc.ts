import 'server-only';

// Server-only RPC transport. Classification policy stays in pipeline/policy;
// these helpers only invoke already-gated database enforcement functions.
import { supabaseAdmin } from '@/lib/supabaseServer';
import { normalizeWallet } from '@/lib/sybil/v2/pipelinePrimitives';
import type { VeBetterNetwork } from '@/lib/vebetter/network';

type RestrictionInvitation = {
  invite_code: string;
  activation_network: VeBetterNetwork | null;
};

export type SybilV2RestrictionRpcResult = {
  changed?: boolean;
  state?: string;
  revision?: number | string;
  reason?: string;
};

export async function applySecurityClientInviterRestriction({
  invitation,
  expectedRevision,
}: {
  invitation: RestrictionInvitation;
  expectedRevision: number;
}): Promise<SybilV2RestrictionRpcResult> {
  if (!invitation.activation_network) {
    return { changed: false, reason: 'NETWORK_MISSING' };
  }

  const { data, error } = await supabaseAdmin.rpc(
    'apply_sybil_v2_security_client_inviter_restriction',
    {
      p_invite_code: invitation.invite_code,
      p_expected_revision: expectedRevision,
      p_network: invitation.activation_network,
    },
  );

  if (error) {
    throw new Error(
      `Security-client restriction could not be applied: ${error.message}`,
    );
  }

  return (data ?? {}) as SybilV2RestrictionRpcResult;
}

export async function applyRestrictedSiblingReentryRestriction({
  invitation,
  expectedRevision,
}: {
  invitation: RestrictionInvitation;
  expectedRevision: number;
}): Promise<SybilV2RestrictionRpcResult> {
  if (!invitation.activation_network) {
    return { changed: false, reason: 'NETWORK_MISSING' };
  }

  const { data, error } = await supabaseAdmin.rpc(
    'apply_sybil_v2_restricted_sibling_reentry_restriction',
    {
      p_invite_code: invitation.invite_code,
      p_expected_revision: expectedRevision,
      p_network: invitation.activation_network,
    },
  );

  if (error) {
    throw new Error(
      `Restricted-sibling reentry restriction could not be applied: ${error.message}`,
    );
  }

  return (data ?? {}) as SybilV2RestrictionRpcResult;
}

export async function applyFunderReturnLoopRestriction({
  invitation,
  expectedRevision,
  hubWallet,
}: {
  invitation: RestrictionInvitation;
  expectedRevision: number;
  hubWallet: string;
}): Promise<SybilV2RestrictionRpcResult> {
  if (!invitation.activation_network) {
    return {
      changed: false,
      reason: 'NETWORK_MISSING',
    };
  }

  const { data, error } = await supabaseAdmin.rpc(
    'apply_sybil_v2_funder_return_loop_restriction',
    {
      p_invite_code: invitation.invite_code,
      p_expected_revision: expectedRevision,
      p_hub_wallet: normalizeWallet(hubWallet),
      p_network: invitation.activation_network,
    },
  );

  if (error) {
    throw new Error(
      `Funder-return loop restriction could not be applied: ${error.message}`,
    );
  }

  return (data ?? {}) as SybilV2RestrictionRpcResult;
}

export async function applyBehaviorPatternRestriction({
  invitation,
  expectedRevision,
  hubWallet,
}: {
  invitation: RestrictionInvitation;
  expectedRevision: number;
  hubWallet: string;
}): Promise<SybilV2RestrictionRpcResult> {
  if (!invitation.activation_network) {
    return {
      changed: false,
      reason: 'NETWORK_MISSING',
    };
  }

  const { data, error } = await supabaseAdmin.rpc(
    'apply_sybil_v2_behavior_pattern_restriction',
    {
      p_invite_code: invitation.invite_code,
      p_expected_revision: expectedRevision,
      p_hub_wallet: normalizeWallet(hubWallet),
      p_network: invitation.activation_network,
    },
  );

  if (error) {
    throw new Error(
      `Behavior-pattern restriction could not be applied: ${error.message}`,
    );
  }

  return (data ?? {}) as SybilV2RestrictionRpcResult;
}
