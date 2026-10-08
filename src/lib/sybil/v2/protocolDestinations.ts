import 'server-only';

import { supabaseAdmin } from '@/lib/supabaseServer';
import { normalizeWallet } from '@/lib/sybil/v2/pipelinePrimitives';
import {
  getVeBetterNetworkConfig,
  type VeBetterNetwork,
} from '@/lib/vebetter/network';

export function knownProtocolDestinations(): Set<string> {
  const config = getVeBetterNetworkConfig();

  return new Set([
    '0x0000000000000000000000000000000000000000',
    config.b3trAddress.toLowerCase(),
    config.vot3Address.toLowerCase(),
    config.x2EarnAppsAddress.toLowerCase(),
    config.x2EarnRewardsPoolAddress.toLowerCase(),
    config.xAllocationVotingAddress.toLowerCase(),
    '0x76ca782b59c74d088c7d2cce2f211bc00836c602', // VOT3
    '0x8692410da301a9b796b68a58ff660d51e979c6fa', // gas abstraction paymaster
    '0xf9a1bc92e0eeee598b9fdb45397107b1f05f6cc1', // VeSwap router
    '0xf21dd7108d93af56fab07423efb90f4a3604da89', // legacy BetterSwap routing target
    '0xda5a60c8559a37eab5950a4ace9b77c25f6fde80', // BetterSwap aggregator
    '0xc6de3b8e4a9bf4a6756e60f5cb6705cb7d3c1649', // canonical VeChain AMM pool
  ]);
}

export async function loadKnownProtocolDestinations(
  network: VeBetterNetwork,
): Promise<Set<string>> {
  const destinations = knownProtocolDestinations();
  const { data, error } = await supabaseAdmin
    .from('sybil_v2_cluster_hub_allowlist')
    .select('wallet_address')
    .eq('network', network);

  if (error) {
    throw new Error(
      `Sybil protocol allowlist could not be loaded: ${error.message}`,
    );
  }

  for (const row of data ?? []) {
    if (typeof row.wallet_address === 'string') {
      destinations.add(normalizeWallet(row.wallet_address));
    }
  }

  return destinations;
}
