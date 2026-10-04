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
