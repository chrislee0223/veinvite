import { isValidNetworkWallet } from '@/lib/networkCanvasGeometry';

export type NetworkSearchInput = {
  normalizedQuery: string;
  isWalletLikeSearch: boolean;
  domainSearchInput: string | undefined;
};

export type NetworkSearchReadiness =
  | 'idle'
  | 'domain-loading'
  | 'blocked'
  | 'ready';

export function deriveNetworkSearchInput(
  searchOpen: boolean,
  rawQuery: string,
): NetworkSearchInput {
  const normalizedQuery = rawQuery
    .trim()
    .toLowerCase();
  const isWalletLikeSearch =
    normalizedQuery.startsWith('0x');
  const domainSearchInput =
    searchOpen &&
    normalizedQuery.length >= 3 &&
    !isValidNetworkWallet(normalizedQuery) &&
    normalizedQuery.includes('.')
      ? normalizedQuery
      : undefined;

  return {
    normalizedQuery,
    isWalletLikeSearch,
    domainSearchInput,
  };
}

export function resolveNetworkSearchAddress(
  normalizedQuery: string,
  domainAddress: unknown,
): string | null {
  if (isValidNetworkWallet(normalizedQuery)) {
    return normalizedQuery;
  }

  const normalizedDomainAddress =
    typeof domainAddress === 'string'
      ? domainAddress.toLowerCase()
      : '';

  return isValidNetworkWallet(
    normalizedDomainAddress,
  )
    ? normalizedDomainAddress
    : null;
}

export function getNetworkSearchReadiness({
  normalizedQuery,
  domainSearchInput,
  domainSearchLoading,
  resolvedSearchAddress,
  isWalletLikeSearch,
}: NetworkSearchInput & {
  domainSearchLoading: boolean;
  resolvedSearchAddress: string | null;
}): NetworkSearchReadiness {
  if (normalizedQuery.length < 3) {
    return 'idle';
  }

  if (
    domainSearchInput &&
    domainSearchLoading
  ) {
    return 'domain-loading';
  }

  if (
    domainSearchInput &&
    !resolvedSearchAddress
  ) {
    return 'blocked';
  }

  if (
    !resolvedSearchAddress &&
    !isWalletLikeSearch
  ) {
    return 'blocked';
  }

  return 'ready';
}
