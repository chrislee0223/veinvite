export type VeBetterNetwork =
  | 'mainnet'
  | 'testnet'
  | 'testnet-staging';

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

const OFFICIAL_DEFAULTS = {
  mainnet: {
    nodeUrl: 'https://mainnet.vechain.org',
    x2EarnAppsAddress:
      '0x8392B7CCc763dB03b47afcD8E8f5e24F9cf0554D',
    x2EarnRewardsPoolAddress:
      '0x6Bee7DDab6c99d5B2Af0554EaEA484CE18F52631',
    xAllocationVotingAddress:
      '0x89A00Bb0947a30FF95BEeF77a66AEdE3842Fe5B7',
  },
  testnet: {
    nodeUrl: 'https://testnet.vechain.org',
    x2EarnAppsAddress:
      '0x1ae6eee231bcf8229d42626b4d663d45a6abd889',
    x2EarnRewardsPoolAddress:
      '0x23bca0fa2e0028c09bd962ec7f521e84b3b2561a',
    xAllocationVotingAddress:
      '0xe3c043786e991bd446be5242e79dff757fbda348',
  },
  'testnet-staging': {
    nodeUrl: 'https://testnet.vechain.org',
    x2EarnAppsAddress:
      '0x0b54a094b877a25bdc95b4431eaa1e2206b1ddfe',
    x2EarnRewardsPoolAddress:
      '0x2d2a2207c68a46fc79325d7718e639d1047b0d8b',
    xAllocationVotingAddress:
      '0x8800592c463f0b21ae08732559ee8e146db1d7b2',
  },
} as const;

function sameAddress(
  left: string | undefined,
  right: string,
): boolean {
  return Boolean(
    left &&
      left.toLowerCase() === right.toLowerCase(),
  );
}

function normalizeNetworkValue(
  value: string | undefined,
): VeBetterNetwork | null {
  const normalized = value?.trim().toLowerCase();

  if (
    normalized === 'testnet-staging' ||
    normalized === 'staging'
  ) {
    return 'testnet-staging';
  }

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

function inferReviewedStagingProfile(): boolean {
  const staging =
    OFFICIAL_DEFAULTS['testnet-staging'];

  return (
    sameAddress(
      process.env.X2EARN_REWARDS_POOL_ADDRESS,
      staging.x2EarnRewardsPoolAddress,
    ) ||
    sameAddress(
      process.env.X_ALLOCATION_VOTING_ADDRESS,
      staging.xAllocationVotingAddress,
    ) ||
    sameAddress(
      process.env.X2EARN_APPS_ADDRESS,
      staging.x2EarnAppsAddress,
    )
  );
}

export function getVeBetterNetwork(): VeBetterNetwork {
  const serverNetwork =
    normalizeNetworkValue(process.env.VECHAIN_NETWORK);

  if (serverNetwork) {
    return serverNetwork;
  }

  // The VeBetter staging governance site runs on VeChain testnet but uses a
  // separate reviewed contract set. Existing Vercel variables identify that
  // profile even when NEXT_PUBLIC_NETWORK_TYPE only says "test".
  if (inferReviewedStagingProfile()) {
    return 'testnet-staging';
  }

  const publicNetwork =
    normalizeNetworkValue(process.env.NEXT_PUBLIC_NETWORK_TYPE);

  if (publicNetwork) {
    return publicNetwork;
  }

  const nodeUrl = process.env.VECHAIN_NODE_URL?.toLowerCase();

  if (nodeUrl?.includes('testnet')) {
    return 'testnet';
  }

  if (nodeUrl?.includes('mainnet')) {
    return 'mainnet';
  }

  // Preserve the existing production behavior when no network hint exists.
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

function resolveContractAddress({
  envValue,
  officialValue,
  fieldName,
  network,
}: {
  envValue: string | undefined;
  officialValue: string;
  fieldName: string;
  network: VeBetterNetwork;
}): string {
  const officialAddress =
    requireAddress(officialValue, `${fieldName} official default`);

  if (!envValue) {
    return officialAddress;
  }

  const override =
    requireAddress(envValue, fieldName);

  if (
    override.toLowerCase() ===
    officialAddress.toLowerCase()
  ) {
    return officialAddress;
  }

  if (
    process.env.VEBETTER_ALLOW_CONTRACT_OVERRIDE === 'true'
  ) {
    console.warn(
      `${fieldName} overrides the reviewed ${network} VeBetter address.`,
    );
    return override;
  }

  console.warn(
    `${fieldName} does not match the reviewed ${network} VeBetter address; ` +
      'ignoring the unreviewed override.',
  );

  return officialAddress;
}

export function getVeBetterNetworkConfig() {
  const network = getVeBetterNetwork();
  const defaults = OFFICIAL_DEFAULTS[network];

  const nodeUrl = (
    process.env.VECHAIN_NODE_URL ?? defaults.nodeUrl
  ).replace(/\/+$/, '');

  const x2EarnAppsAddress =
    resolveContractAddress({
      envValue:
        process.env.X2EARN_APPS_ADDRESS,
      officialValue:
        defaults.x2EarnAppsAddress,
      fieldName:
        'X2EARN_APPS_ADDRESS',
      network,
    });

  const x2EarnRewardsPoolAddress =
    resolveContractAddress({
      envValue:
        process.env.X2EARN_REWARDS_POOL_ADDRESS,
      officialValue:
        defaults.x2EarnRewardsPoolAddress,
      fieldName:
        'X2EARN_REWARDS_POOL_ADDRESS',
      network,
    });

  const xAllocationVotingAddress =
    resolveContractAddress({
      envValue:
        process.env.X_ALLOCATION_VOTING_ADDRESS,
      officialValue:
        defaults.xAllocationVotingAddress,
      fieldName:
        'X_ALLOCATION_VOTING_ADDRESS',
      network,
    });

  return {
    network,
    nodeUrl,
    x2EarnAppsAddress,
    x2EarnRewardsPoolAddress,
    xAllocationVotingAddress,
  } as const;
}
