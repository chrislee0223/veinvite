import { ThorClient } from '@vechain/sdk-network';

import { VEINVITE_APP_ID } from '@/lib/rewards/onchainPool';
import { getVeBetterNetworkConfig } from '@/lib/vebetter/network';

const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/;

const operatorAccessAbi = [
  {
    inputs: [{ name: 'appId', type: 'bytes32' }],
    name: 'appAdmin',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'appId', type: 'bytes32' }],
    name: 'rewardDistributors',
    outputs: [{ name: '', type: 'address[]' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export type VeInviteOperatorAccess = {
  appAdmin: string;
  rewardDistributors: string[];
};

function firstValue(
  result: readonly unknown[],
  fieldName: string,
): unknown {
  if (result.length < 1) {
    throw new Error(
      `VeBetterDAO ${fieldName} returned no value.`,
    );
  }

  return result[0];
}

function readAddress(
  result: readonly unknown[],
  fieldName: string,
): string {
  const value = String(
    firstValue(result, fieldName),
  ).toLowerCase();

  if (!ADDRESS_PATTERN.test(value)) {
    throw new Error(
      `VeBetterDAO ${fieldName} returned an invalid address.`,
    );
  }

  return value;
}

function readAddressArray(
  result: readonly unknown[],
  fieldName: string,
): string[] {
  const value = firstValue(result, fieldName);

  if (!Array.isArray(value)) {
    throw new Error(
      `VeBetterDAO ${fieldName} returned an invalid address list.`,
    );
  }

  return value.map((entry) => {
    const address = String(entry).toLowerCase();

    if (!ADDRESS_PATTERN.test(address)) {
      throw new Error(
        `VeBetterDAO ${fieldName} contains an invalid address.`,
      );
    }

    return address;
  });
}

/**
 * Reads only the two on-chain values needed to authorize VeInvite operator UI.
 * Full reward-pool status intentionally stays on the operations paths that
 * actually need balances, pause state, allocation policy and runtime safety.
 */
export async function readVeInviteOperatorAccess():
Promise<VeInviteOperatorAccess> {
  const {
    nodeUrl,
    x2EarnAppsAddress,
  } = getVeBetterNetworkConfig();
  const thor = ThorClient.at(nodeUrl);
  const apps = thor.contracts.load(
    x2EarnAppsAddress,
    operatorAccessAbi,
  );

  const [appAdminResult, distributorsResult] =
    await Promise.all([
      apps.read.appAdmin(VEINVITE_APP_ID),
      apps.read.rewardDistributors(VEINVITE_APP_ID),
    ]);

  return {
    appAdmin: readAddress(
      appAdminResult,
      'appAdmin',
    ),
    rewardDistributors: readAddressArray(
      distributorsResult,
      'rewardDistributors',
    ),
  };
}

export function isVeInviteRewardOperator(
  walletAddress: string,
  access: VeInviteOperatorAccess,
): boolean {
  const normalized = walletAddress.toLowerCase();

  return (
    normalized === access.appAdmin &&
    access.rewardDistributors.includes(normalized)
  );
}
