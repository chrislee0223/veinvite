import 'server-only';

import { supabaseAdmin } from '@/lib/supabaseServer';
import type { VeBetterNetwork } from '@/lib/vebetter/network';

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
  const { data, error } = await supabaseAdmin
    .from('sybil_v2_wallet_restrictions')
    .select(
      'id,wallet_address,network,reason_codes,evidence_summary,related_invite_code,imposed_at',
    )
    .eq('wallet_address', wallet)
    .eq('network', network)
    .eq('status', 'ACTIVE')
    .maybeSingle();

  if (error) {
    // Before the v2 migration exists, callers on a Preview deployment should
    // fail closed rather than silently treating a missing restriction table as
    // proof that the wallet is clean.
    throw new Error(
      `Sybil v2 restriction state could not be loaded: ${error.message}`,
    );
  }

  return (data as ActiveSybilV2Restriction | null) ?? null;
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

  const { data, error } = await supabaseAdmin
    .from('sybil_v2_wallet_restrictions')
    .select(
      'id,wallet_address,network,reason_codes,evidence_summary,related_invite_code,imposed_at',
    )
    .eq('network', network)
    .eq('status', 'ACTIVE')
    .in('wallet_address', wallets)
    .order('imposed_at', { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(
      `Sybil v2 restriction state could not be loaded: ${error.message}`,
    );
  }

  return ((data ?? [])[0] as ActiveSybilV2Restriction | undefined) ?? null;
}
