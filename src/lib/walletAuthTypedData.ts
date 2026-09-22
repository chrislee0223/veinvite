export type WalletAuthTypedDataInput = {
  walletAddress: string;
  nonce: string;
  expiresAt: string;
  origin: string;
  network: string;
  message: string;
};

export function canonicalizeWalletAuthExpiresAt(
  expiresAt: string,
): string {
  const parsed = new Date(expiresAt);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(
      'Invalid wallet authentication expiry.',
    );
  }

  return parsed.toISOString();
}

function chainIdForNetwork(
  network: string,
): number {
  return network === 'mainnet'
    ? 100009
    : 100010;
}

export function buildWalletAuthTypedData({
  walletAddress,
  nonce,
  expiresAt,
  origin,
  network,
  message,
}: WalletAuthTypedDataInput) {
  const canonicalExpiresAt =
    canonicalizeWalletAuthExpiresAt(
      expiresAt,
    );

  return {
    domain: {
      name: 'VeInvite',
      version: '1',
      chainId:
        chainIdForNetwork(network),
    },
    types: {
      Authentication: [
        {
          name: 'walletAddress',
          type: 'address',
        },
        {
          name: 'nonce',
          type: 'string',
        },
        {
          name: 'expiresAt',
          type: 'string',
        },
        {
          name: 'origin',
          type: 'string',
        },
        {
          name: 'network',
          type: 'string',
        },
        {
          name: 'message',
          type: 'string',
        },
      ],
    },
    value: {
      walletAddress,
      nonce,
      expiresAt: canonicalExpiresAt,
      origin,
      network,
      message,
    },
  };
}
