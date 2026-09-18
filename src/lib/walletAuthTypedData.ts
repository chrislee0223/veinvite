export type WalletAuthTypedDataInput = {
  walletAddress: string;
  nonce: string;
  expiresAt: string;
  origin: string;
  network: string;
  message: string;
};

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
      expiresAt,
      origin,
      network,
      message,
    },
  };
}
