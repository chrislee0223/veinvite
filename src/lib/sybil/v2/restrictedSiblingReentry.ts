import 'server-only';

import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  normalizeWallet,
  unique,
} from '@/lib/sybil/v2/pipelinePrimitives';
import type { SybilV2Signal } from '@/lib/sybil/v2/policy';
import {
  SYBIL_V2_ANALYZER_VERSION,
} from '@/lib/sybil/v2/version';
import type { VeBetterNetwork } from '@/lib/vebetter/network';

type RestrictedSiblingInvitation = {
  invite_code: string;
  inviter_wallet: string;
  invitee_wallet: string | null;
  activation_network: VeBetterNetwork | null;
  activated_at: string | null;
};

export type RestrictedSiblingRestrictionRpcResult = {
  changed?: boolean;
  state?: string;
  revision?: number | string;
  reason?: string;
};

async function loadExcludedWallets(
  wallets: string[],
): Promise<Set<string>> {
  const normalized = unique(
    wallets
      .filter(Boolean)
      .map((wallet) => normalizeWallet(wallet)),
  );

  if (normalized.length === 0) {
    return new Set<string>();
  }

  const { data, error } = await supabaseAdmin
    .from('analytics_excluded_wallets')
    .select('wallet_address')
    .eq('active', true)
    .in('wallet_address', normalized);

  if (error) {
    throw new Error(
      `Restricted sibling analytics-exclusion lookup failed: ${error.message}`,
    );
  }

  return new Set(
    (data ?? [])
      .map((row) =>
        typeof row.wallet_address === 'string'
          ? normalizeWallet(row.wallet_address)
          : null,
      )
      .filter((wallet): wallet is string => Boolean(wallet)),
  );
}

async function persistRestrictedSiblingEvidence({
  invitation,
  inviteeWallet,
  peerWallet,
  peerInviteCode,
  peerRestrictionImposedAt,
  clientId,
  switchGapSeconds,
  activationGapSeconds,
}: {
  invitation: RestrictedSiblingInvitation;
  inviteeWallet: string;
  peerWallet: string;
  peerInviteCode: string;
  peerRestrictionImposedAt: string;
  clientId: string;
  switchGapSeconds: number;
  activationGapSeconds: number;
}) {
  if (!invitation.activation_network) return;

  const { error } = await supabaseAdmin
    .from('sybil_v2_evidence_records')
    .upsert({
      invite_code: invitation.invite_code,
      network: invitation.activation_network,
      subject_wallet: inviteeWallet,
      evidence_family: 'SECURITY_IDENTITY',
      signal_code: 'SECURITY_CLIENT_RESTRICTED_SIBLING_REENTRY',
      strength: 'HIGH',
      score: 100,
      related_wallet: peerWallet,
      app_id: null,
      observed_block: null,
      observed_at: null,
      analyzer_version: SYBIL_V2_ANALYZER_VERSION,
      evidence: {
        sameInviterRestrictedSibling: true,
        inviterWallet: normalizeWallet(invitation.inviter_wallet),
        peerInviteCode,
        peerWallet,
        peerRestrictionImposedAt,
        sharedClientId: clientId,
        sequentialWalletReplacement: true,
        switchGapSeconds,
        activationGapSeconds,
        preVoteDetection: true,
      },
      dedupe_key:
        `sybil-v2:${invitation.invite_code}:security-client-restricted-sibling-reentry:${clientId}:${peerInviteCode}`,
    }, {
      onConflict: 'dedupe_key',
      ignoreDuplicates: true,
    });

  if (error && error.code !== '23505') {
    throw new Error(
      `Restricted sibling evidence could not be saved: ${error.message}`,
    );
  }
}

export async function loadRestrictedSiblingReentrySignals(
  invitation: RestrictedSiblingInvitation,
): Promise<SybilV2Signal[]> {
  if (
    !invitation.activation_network ||
    !invitation.invitee_wallet ||
    !invitation.activated_at
  ) {
    return [];
  }

  const inviteeWallet = normalizeWallet(invitation.invitee_wallet);
  const inviterWallet = normalizeWallet(invitation.inviter_wallet);

  const siblingInvitationsResult = await supabaseAdmin
    .from('invitations')
    .select('invite_code,invitee_wallet')
    .eq('inviter_wallet', inviterWallet)
    .neq('invite_code', invitation.invite_code)
    .not('invitee_wallet', 'is', null);

  if (siblingInvitationsResult.error) {
    throw new Error(
      `Restricted sibling invitations could not be loaded: ${siblingInvitationsResult.error.message}`,
    );
  }

  const siblingInvitations = (siblingInvitationsResult.data ?? [])
    .filter((row) => typeof row.invitee_wallet === 'string');

  if (siblingInvitations.length === 0) {
    return [];
  }

  const restrictionsResult = await supabaseAdmin
    .from('sybil_v2_wallet_restrictions')
    .select('related_invite_code,wallet_address,imposed_at')
    .eq('network', invitation.activation_network)
    .eq('status', 'ACTIVE')
    .is('resolved_at', null)
    .in(
      'related_invite_code',
      siblingInvitations.map((row) => String(row.invite_code)),
    );

  if (restrictionsResult.error) {
    throw new Error(
      `Restricted sibling restrictions could not be loaded: ${restrictionsResult.error.message}`,
    );
  }

  const restrictions = restrictionsResult.data ?? [];
  const restrictedPeers = siblingInvitations
    .map((row) => {
      const wallet = normalizeWallet(String(row.invitee_wallet));
      const restriction = restrictions.find(
        (candidate) =>
          String(candidate.related_invite_code) ===
            String(row.invite_code) &&
          normalizeWallet(String(candidate.wallet_address)) === wallet,
      );

      return restriction
        ? {
            inviteCode: String(row.invite_code),
            wallet,
            imposedAt: String(restriction.imposed_at),
          }
        : null;
    })
    .filter((row): row is {
      inviteCode: string;
      wallet: string;
      imposedAt: string;
    } => row !== null);

  if (restrictedPeers.length === 0) {
    return [];
  }

  const excludedWallets = await loadExcludedWallets([
    inviterWallet,
    inviteeWallet,
    ...restrictedPeers.map((peer) => peer.wallet),
  ]);

  if (
    excludedWallets.has(inviterWallet) ||
    excludedWallets.has(inviteeWallet)
  ) {
    return [];
  }

  const eligiblePeers = restrictedPeers.filter(
    (peer) => !excludedWallets.has(peer.wallet),
  );

  if (eligiblePeers.length === 0) {
    return [];
  }

  const currentObservationsResult = await supabaseAdmin
    .from('security_client_wallet_observations')
    .select('client_id,first_seen_at,last_seen_at')
    .eq('wallet_address', inviteeWallet);

  if (currentObservationsResult.error) {
    throw new Error(
      `Restricted sibling current-client evidence could not be loaded: ${currentObservationsResult.error.message}`,
    );
  }

  const currentObservations = currentObservationsResult.data ?? [];
  const clientIds = unique(
    currentObservations.map((row) => String(row.client_id)),
  );

  if (clientIds.length === 0) {
    return [];
  }

  const peerObservationsResult = await supabaseAdmin
    .from('security_client_wallet_observations')
    .select('client_id,wallet_address,first_seen_at,last_seen_at')
    .in('client_id', clientIds)
    .in(
      'wallet_address',
      eligiblePeers.map((peer) => peer.wallet),
    );

  if (peerObservationsResult.error) {
    throw new Error(
      `Restricted sibling peer-client evidence could not be loaded: ${peerObservationsResult.error.message}`,
    );
  }

  const activationAt = Date.parse(invitation.activated_at);
  if (Number.isNaN(activationAt)) {
    return [];
  }

  for (const currentObservation of currentObservations) {
    const clientId = String(currentObservation.client_id);
    const currentFirstSeenAt = Date.parse(
      String(currentObservation.first_seen_at),
    );

    if (Number.isNaN(currentFirstSeenAt)) {
      continue;
    }

    const activationGapSeconds =
      Math.abs(activationAt - currentFirstSeenAt) / 1000;

    if (activationGapSeconds > 10 * 60) {
      continue;
    }

    for (const peer of eligiblePeers) {
      const peerObservations = (peerObservationsResult.data ?? [])
        .filter(
          (row) =>
            String(row.client_id) === clientId &&
            normalizeWallet(String(row.wallet_address)) === peer.wallet,
        )
        .sort(
          (left, right) =>
            Date.parse(String(right.last_seen_at)) -
            Date.parse(String(left.last_seen_at)),
        );

      for (const peerObservation of peerObservations) {
        const peerLastSeenAt = Date.parse(
          String(peerObservation.last_seen_at),
        );

        if (Number.isNaN(peerLastSeenAt)) {
          continue;
        }

        const switchGapSeconds =
          (currentFirstSeenAt - peerLastSeenAt) / 1000;

        if (
          switchGapSeconds < 0 ||
          switchGapSeconds > 10 * 60
        ) {
          continue;
        }

        const signal: SybilV2Signal = {
          code: 'SECURITY_CLIENT_RESTRICTED_SIBLING_REENTRY',
          family: 'SECURITY_IDENTITY',
          strength: 'HIGH',
          score: 100,
          independentKey: clientId,
        };

        await persistRestrictedSiblingEvidence({
          invitation,
          inviteeWallet,
          peerWallet: peer.wallet,
          peerInviteCode: peer.inviteCode,
          peerRestrictionImposedAt: peer.imposedAt,
          clientId,
          switchGapSeconds,
          activationGapSeconds,
        });

        return [signal];
      }
    }
  }

  return [];
}

async function applyRestrictedSiblingReentryRestrictionRpc({
  invitation,
  expectedRevision,
}: {
  invitation: RestrictedSiblingInvitation;
  expectedRevision: number;
}): Promise<RestrictedSiblingRestrictionRpcResult> {
  if (!invitation.activation_network) {
    return {
      changed: false,
      reason: 'NETWORK_MISSING',
    };
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
      `Restricted sibling reentry restriction could not be applied: ${error.message}`,
    );
  }

  return (data ?? {}) as RestrictedSiblingRestrictionRpcResult;
}


export async function enforceRestrictedSiblingReentryRestriction({
  invitation,
  expectedRevision,
}: {
  invitation: RestrictedSiblingInvitation;
  expectedRevision: number;
}): Promise<{
  restricted: boolean;
  revision?: number | string;
}> {
  const automatic =
    await applyRestrictedSiblingReentryRestrictionRpc({
      invitation,
      expectedRevision,
    });

  if (
    automatic.changed === true &&
    automatic.state === 'RESTRICTED'
  ) {
    return {
      restricted: true,
      revision: automatic.revision,
    };
  }

  const { data, error } = await supabaseAdmin
    .from('sybil_v2_referral_assessments')
    .select('state,revision')
    .eq('invite_code', invitation.invite_code)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Restricted sibling assessment refresh failed: ${error.message}`,
    );
  }

  return {
    restricted: data?.state === 'RESTRICTED',
    revision: data?.revision ?? automatic.revision,
  };
}
