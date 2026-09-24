import 'server-only';

import { supabaseAdmin } from '@/lib/supabaseServer';
import type { VeBetterNetwork } from '@/lib/vebetter/network';
import { isSybilV2EnforcementEnabled } from './rollout';

const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/;

function normalizeWallet(walletAddress: string): string {
  const normalized = walletAddress.trim().toLowerCase();
  if (!ADDRESS_PATTERN.test(normalized)) {
    throw new Error('Restriction lookup received an invalid wallet address.');
  }
  return normalized;
}

export type ActiveSybilV2Restriction = {
  id: string;
  wallet_address: string;
  network: VeBetterNetwork;
  restriction_kind:
    | 'BLACKLIST'
    | 'PRE_CLAIM_HOLD'
    | 'POST_PAYOUT_HOLD'\n    | 'INVITER_ESCALATION_HOLD';
  reason_codes: unknown;
  evidence_summary: unknown;
  related_invite_code: string | null;
  imposed_at: string;
};

export async function loadActiveSybilV2Restriction({
  walletAddress,
  network,
}: {
  walletAddress: string;
  network: VeBetterNetwork;
}): Promise<ActiveSybilV2Restriction | null> {
  const wallet = normalizeWallet(walletAddress);

  if (!(await isSybilV2EnforcementEnabled())) {
    return null;
  }

  const [restrictionResult, holdResult] = await Promise.all([
    supabaseAdmin
      .from('sybil_v2_wallet_restrictions')
      .select(
        'id,wallet_address,network,reason_codes,evidence_summary,related_invite_code,imposed_at',
      )
      .eq('wallet_address', wallet)
      .eq('network', network)
      .eq('status', 'ACTIVE')
      .maybeSingle(),
    supabaseAdmin
      .from('operator_sybil_v2_temporary_participation_holds')
      .select(
        'id,wallet_address,network,restriction_kind,reason_codes,evidence_summary,related_invite_code,imposed_at',
      )
      .eq('wallet_address', wallet)
      .eq('network', network)
      .order('imposed_at', { ascending: false })
      .limit(1),
  ]);

  if (restrictionResult.error) {
    throw new Error(
      `Sybil v2 restriction state could not be loaded: ${restrictionResult.error.message}`,
    );
  }
  if (holdResult.error) {
    throw new Error(
      `Sybil v2 temporary HOLD state could not be loaded: ${holdResult.error.message}`,
    );
  }

  if (restrictionResult.data) {
    return {
      ...(restrictionResult.data as Omit<
        ActiveSybilV2Restriction,
        'restriction_kind'
      >),
      restriction_kind: 'BLACKLIST',
    };
  }

  return ((holdResult.data ?? [])[0] as
    | ActiveSybilV2Restriction
    | undefined) ?? null;
}

export async function anyActiveSybilV2Restriction({
  walletAddresses,
  network,
}: {
  walletAddresses: string[];
  network: VeBetterNetwork;
}): Promise<ActiveSybilV2Restriction | null> {
  const wallets = [...new Set(walletAddresses.map(normalizeWallet))];
  if (wallets.length === 0) return null;

  if (!(await isSybilV2EnforcementEnabled())) {
    return null;
  }

  const [restrictionResult, holdResult] = await Promise.all([
    supabaseAdmin
      .from('sybil_v2_wallet_restrictions')
      .select(
        'id,wallet_address,network,reason_codes,evidence_summary,related_invite_code,imposed_at',
      )
      .eq('network', network)
      .eq('status', 'ACTIVE')
      .in('wallet_address', wallets)
      .order('imposed_at', { ascending: false })
      .limit(1),
    supabaseAdmin
      .from('operator_sybil_v2_temporary_participation_holds')
      .select(
        'id,wallet_address,network,restriction_kind,reason_codes,evidence_summary,related_invite_code,imposed_at',
      )
      .eq('network', network)
      .in('wallet_address', wallets)
      .order('imposed_at', { ascending: false })
      .limit(1),
  ]);

  if (restrictionResult.error) {
    throw new Error(
      `Sybil v2 restriction state could not be loaded: ${restrictionResult.error.message}`,
    );
  }
  if (holdResult.error) {
    throw new Error(
      `Sybil v2 temporary HOLD state could not be loaded: ${holdResult.error.message}`,
    );
  }

  const activeRestriction =
    (restrictionResult.data ?? [])[0] as
      | Omit<ActiveSybilV2Restriction, 'restriction_kind'>
      | undefined;
  if (activeRestriction) {
    return {
      ...activeRestriction,
      restriction_kind: 'BLACKLIST',
    };
  }

  return ((holdResult.data ?? [])[0] as
    | ActiveSybilV2Restriction
    | undefined) ?? null;
}
