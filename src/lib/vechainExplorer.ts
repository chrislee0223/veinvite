import type {
  PublicLeaderboardResponse,
} from '@/lib/types';

type PublicNetwork =
  PublicLeaderboardResponse['network'];

function getVeChainExplorerOrigin(
  network: PublicNetwork = 'mainnet',
): string {
  return network === 'mainnet'
    ? 'https://explore.vechain.org'
    : 'https://explore-testnet.vechain.org';
}

export function getVeChainExplorerAddressUrl(
  walletAddress: string,
  network: PublicNetwork = 'mainnet',
): string {
  return `${getVeChainExplorerOrigin(network)}/address/${encodeURIComponent(
    walletAddress,
  )}`;
}

export function getVeChainExplorerTransactionUrl(
  txId: string,
  network: PublicNetwork = 'mainnet',
): string {
  return `${getVeChainExplorerOrigin(network)}/transactions/${encodeURIComponent(
    txId,
  )}`;
}
