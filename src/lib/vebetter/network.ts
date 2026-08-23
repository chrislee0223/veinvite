export type VeBetterNetwork = 'mainnet' | 'testnet';

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

const OFFICIAL_DEFAULTS = {
  mainnet: {
    nodeUrl: 'https://mainnet.vechain.org',
    x2EarnRewardsPoolAddress:
      '0x6Bee7DDab6c99d5B2Af0554EaEA484CE18F52631',
    xAllocationVotingAddress:
      '0x89A00Bb0947a30FF95BEeF77a66AEdE3842Fe5B7',
  },
  testnet: {
    nodeUrl: 'https://testnet.vechain.org',
    x2EarnRewardsPoolAddress:
      '0x23bca0fa2e0028c09bd962ec7f521e84b3b2561a',
    xAllocationVotingAddress:
      '0xe3c043786e991bd446be5242e79dff757fbda348',
  },
} as const;

function normalizeNetworkValue(
  value: string | undefined,
): VeBetterNetwork | null {
  const normalized = value?.trim().toLowerCase();

  if (
    normalized === 'test' ||
    normalized === 'testnet'
  ) {
    return 'testnet';
  }

  if (
    normalized === 'main' ||
    normalized === 'mainnet'
  ) {
    return 'mainnet';
  }

  return null;
}

export function getVeBetterNetwork(): VeBetterNetwork {
  const explicitNetwork =
    normalizeNetworkValue(process.env.VECHAIN_NETWORK) ??
    normalizeNetworkValue(process.env.NEXT_PUBLIC_NETWORK_TYPE);

  if (explicitNetwork) {
    return explicitNetwork;
  }

  const nodeUrl = process.env.VECHAIN_NODE_URL?.toLowerCase();

  if (nodeUrl?.includes('testnet')) {
    return 'testnet';
  }

  if (nodeUrl?.includes('mainnet')) {
    return 'mainnet';
  }

  // Preserve the existing production behavior when no network hint exists.
  // Test/preview deployments should explicitly use NEXT_PUBLIC_NETWORK_TYPE=test,
  // VECHAIN_NETWORK=testnet, or a testnet VECHAIN_NODE_URL.
  return 'mainnet';
}

function requireAddress(
  value: string,
  fieldName: string,
): string {
  if (!ADDRESS_PATTERN.test(value)) {
    throw new Error(`${fieldName} is not a valid VeChain address.`);
  }

  return value;
}

export function getVeBetterNetworkConfig() {
  const network = getVeBetterNetwork();
  const defaults = OFFICIAL_DEFAULTS[network];

  const nodeUrl = (
    process.env.VECHAIN_NODE_URL ?? defaults.nodeUrl
  ).replace(/\/+$/, '');

  const x2EarnRewardsPoolAddress = requireAddress(
    process.env.X2EARN_REWARDS_POOL_ADDRESS ??
      defaults.x2EarnRewardsPoolAddress,
    'X2EARN_REWARDS_POOL_ADDRESS',
  );

  const xAllocationVotingAddress = requireAddress(
    process.env.X_ALLOCATION_VOTING_ADDRESS ??
      defaults.xAllocationVotingAddress,
    'X_ALLOCATION_VOTING_ADDRESS',
  );

  return {
    network,
    nodeUrl,
    x2EarnRewardsPoolAddress,
    xAllocationVotingAddress,
  } as const;
}
