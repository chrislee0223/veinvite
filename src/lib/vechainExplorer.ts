import type {
  PublicLeaderboardResponse,
} from '@/lib/types';

type PublicNetwork =
  PublicLeaderboardResponse['network'];

export function getVeChainExplorerAddressUrl(
  network: PublicNetwork,
  walletAddress: string,
): string {
  const origin =
    network === 'mainnet'
      ? 'https://explore.vechain.org'
      : 'https://explore-testnet.vechain.org';

  return `${origin}/address/${encodeURIComponent(
    walletAddress,
  )}`;
}
