import 'server-only';

import { supabaseAdmin } from '@/lib/supabaseServer';
import { normalizeWallet } from '@/lib/sybil/v2/pipelinePrimitives';
import type { VeBetterNetwork } from '@/lib/vebetter/network';

type RestrictedSiblingRow = {
  wallet_address: string;
  related_invite_code: string | null;
};

export type RestrictedSiblingRestrictionResult = {
  changed?: boolean;
  state?: string;
  revision?: number | string;
  reason?: string;
};

export function restrictedSiblingReferralKey({
  walletAddress,
  inviteCode,
}: {
  walletAddress: string;
  inviteCode: string;
}): string {
  return \`\${normalizeWallet(walletAddress)}:\${inviteCode.toUpperCase()}\`;
}

export async function loadRestrictedSiblingReferralKeys({
  network,
  relatedWallets,
}: {
  network: VeBetterNetwork | null;
  relatedWallets: string[];
}): Promise<Set<string>> {
  if (!network || relatedWallets.length === 0) {
    return new Set();
  }

  const result = await supabaseAdmin
    .from('sybil_v2_wallet_restrictions')
    .select('wallet_address,related_invite_code')
    .eq('network', network)
    .eq('status', 'ACTIVE')
    .in('wallet_address', relatedWallets);

  if (result.error) {
    throw new Error(
      \`Restricted sibling referrals could not be loaded: \${result.error.message}\`,
    );
  }

  return new Set(
    ((result.data ?? []) as RestrictedSiblingRow[])
      .filter((row) => row.related_invite_code)
      .map((row) =>
        restrictedSiblingReferralKey({
          walletAddress: row.wallet_address,
          inviteCode: String(row.related_invite_code),
        }),
      ),
  );
}

export type SharedClientSiblingInvitation = {
  invite_code: string;
  inviter_wallet: string;
  invitee_wallet: string | null;
  activated_at: string | null;
  status: string;
  sybil_status: string;
  eligibility_check_id: number | string | null;
  ineligibility_check_id: number | string | null;
};

export async function loadSharedClientSiblingInvitations({
  inviterWallet,
  relatedWallets,
  excludedWallets,
  network,
}: {
  inviterWallet: string;
  relatedWallets: string[];
  excludedWallets: Set<string>;
  network: VeBetterNetwork | null;
}): Promise<{
  siblingInvitations: SharedClientSiblingInvitation[];
  restrictedSiblingReferrals: Set<string>;
}> {
  const siblingInvitationsResult = await supabaseAdmin
    .from('invitations')
    .select(
      'invite_code,inviter_wallet,invitee_wallet,activated_at,status,sybil_status,eligibility_check_id,ineligibility_check_id',
    )
    .eq('inviter_wallet', inviterWallet)
    .in('invitee_wallet', relatedWallets);

  if (siblingInvitationsResult.error) {
    throw new Error(
      \`Sibling security-client invitations could not be loaded: \${siblingInvitationsResult.error.message}\`,
    );
  }

  const restrictedSiblingReferrals =
    await loadRestrictedSiblingReferralKeys({
      network,
      relatedWallets,
    });

  const siblingInvitations =
    ((siblingInvitationsResult.data ?? []) as SharedClientSiblingInvitation[])
      .filter((row) => {
        if (
          typeof row.invitee_wallet !== 'string' ||
          row.eligibility_check_id === null ||
          row.ineligibility_check_id !== null
        ) {
          return false;
        }

        const siblingWallet = normalizeWallet(row.invitee_wallet);
        const peerConfirmedRestricted =
          restrictedSiblingReferrals.has(
            restrictedSiblingReferralKey({
              walletAddress: siblingWallet,
              inviteCode: String(row.invite_code),
            }),
          );
        const normallyEligible =
          ['ACTIVATING', 'UNDER_REVIEW', 'COMPLETED'].includes(
            String(row.status),
          ) &&
          row.sybil_status !== 'BLOCKED';
        const confirmedRestrictedReferral =
          peerConfirmedRestricted &&
          ['ACTIVATING', 'UNDER_REVIEW', 'COMPLETED', 'CANCELLED'].includes(
            String(row.status),
          );

        return (
          (normallyEligible || confirmedRestrictedReferral) &&
          !excludedWallets.has(siblingWallet)
        );
      });

  return {
    siblingInvitations,
    restrictedSiblingReferrals,
  };
}

export function isRestrictedSiblingReentry({
  peerConfirmedRestricted,
  switchGapSeconds,
  activationGapSeconds,
  currentFirstSeenAt,
  peerLastSeenAt,
}: {
  peerConfirmedRestricted: boolean;
  switchGapSeconds: number | null;
  activationGapSeconds: number | null;
  currentFirstSeenAt: string;
  peerLastSeenAt: string;
}): boolean {
  const currentFirstSeen = Date.parse(currentFirstSeenAt);
  const peerLastSeen = Date.parse(peerLastSeenAt);

  return (
    peerConfirmedRestricted &&
    switchGapSeconds !== null &&
    activationGapSeconds !== null &&
    !Number.isNaN(currentFirstSeen) &&
    !Number.isNaN(peerLastSeen) &&
    currentFirstSeen >= peerLastSeen &&
    switchGapSeconds <= 10 * 60 &&
    activationGapSeconds <= 10 * 60
  );
}

export async function applyRestrictedSiblingReentryRestriction({
  inviteCode,
  expectedRevision,
  network,
}: {
  inviteCode: string;
  expectedRevision: number;
  network: VeBetterNetwork | null;
}): Promise<RestrictedSiblingRestrictionResult> {
  if (!network) {
    return { changed: false, reason: 'NETWORK_MISSING' };
  }

  const { data, error } = await supabaseAdmin.rpc(
    'apply_sybil_v2_restricted_sibling_reentry_restriction',
    {
      p_invite_code: inviteCode,
      p_expected_revision: expectedRevision,
      p_network: network,
    },
  );

  if (error) {
    throw new Error(
      \`Restricted-sibling reentry restriction could not be applied: \${error.message}\`,
    );
  }

  return (data ?? {}) as RestrictedSiblingRestrictionResult;
}
