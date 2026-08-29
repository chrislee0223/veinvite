import { ThorClient } from '@vechain/sdk-network';

process.env.VERCEL_ENV = 'production';
process.env.VECHAIN_NETWORK = 'mainnet';

const { getVeBetterNetworkConfig } = await import('../src/lib/vebetter/network.ts');

const VEINVITE_APP_ID =
  '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
const EXPECTED_TEAM_PERCENTAGE = 20n;
const EXPECTED_USER_PERCENTAGE = 80n;
const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/;

const x2EarnAppsAbi = [
  {
    inputs: [{ name: 'appId', type: 'bytes32' }],
    name: 'teamAllocationPercentage',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
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
];

const rewardsPoolAbi = [
  {
    inputs: [{ name: 'appId', type: 'bytes32' }],
    name: 'isRewardsPoolEnabled',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'appId', type: 'bytes32' }],
    name: 'rewardsPoolBalance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'appId', type: 'bytes32' }],
    name: 'availableFunds',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'appId', type: 'bytes32' }],
    name: 'totalBalance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'appId', type: 'bytes32' }],
    name: 'isDistributionPaused',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'version',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'pure',
    type: 'function',
  },
];

function first(result, label) {
  if (!Array.isArray(result) || result.length < 1) {
    throw new Error(`${label} returned no value.`);
  }
  return result[0];
}

function readInteger(result, label) {
  const value = String(first(result, label));
  if (!/^\d+$/.test(value)) {
    throw new Error(`${label} returned an invalid integer.`);
  }
  return BigInt(value);
}

function readBoolean(result, label) {
  const value = first(result, label);
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${label} returned an invalid boolean.`);
}

function readAddress(result, label) {
  const value = String(first(result, label)).toLowerCase();
  if (!ADDRESS_PATTERN.test(value)) {
    throw new Error(`${label} returned an invalid address.`);
  }
  return value;
}

function readAddressArray(result, label) {
  const value = first(result, label);
  if (!Array.isArray(value)) {
    throw new Error(`${label} returned an invalid address list.`);
  }
  return value.map((entry) => {
    const address = String(entry).toLowerCase();
    if (!ADDRESS_PATTERN.test(address)) {
      throw new Error(`${label} contains an invalid address.`);
    }
    return address;
  });
}

function readString(result, label) {
  const value = String(first(result, label)).trim();
  if (!value) throw new Error(`${label} returned an empty string.`);
  return value;
}

const config = getVeBetterNetworkConfig();
if (config.network !== 'mainnet') {
  throw new Error(`Expected mainnet but resolved ${config.network}.`);
}

const thor = ThorClient.at(config.nodeUrl);
const apps = thor.contracts.load(config.x2EarnAppsAddress, x2EarnAppsAbi);
const pool = thor.contracts.load(config.x2EarnRewardsPoolAddress, rewardsPoolAbi);

const [
  teamPercentageResult,
  appAdminResult,
  distributorsResult,
  poolEnabledResult,
  rewardsBalanceResult,
  availableFundsResult,
  totalBalanceResult,
  pausedResult,
  versionResult,
] = await Promise.all([
  apps.read.teamAllocationPercentage(VEINVITE_APP_ID),
  apps.read.appAdmin(VEINVITE_APP_ID),
  apps.read.rewardDistributors(VEINVITE_APP_ID),
  pool.read.isRewardsPoolEnabled(VEINVITE_APP_ID),
  pool.read.rewardsPoolBalance(VEINVITE_APP_ID),
  pool.read.availableFunds(VEINVITE_APP_ID),
  pool.read.totalBalance(VEINVITE_APP_ID),
  pool.read.isDistributionPaused(VEINVITE_APP_ID),
  pool.read.version(),
]);

const teamAllocationPercentage = readInteger(
  teamPercentageResult,
  'teamAllocationPercentage',
);
const appAdmin = readAddress(appAdminResult, 'appAdmin');
const rewardDistributors = readAddressArray(
  distributorsResult,
  'rewardDistributors',
);
const rewardsPoolEnabled = readBoolean(
  poolEnabledResult,
  'isRewardsPoolEnabled',
);
const rewardsPoolBalance = readInteger(
  rewardsBalanceResult,
  'rewardsPoolBalance',
);
const availableFunds = readInteger(
  availableFundsResult,
  'availableFunds',
);
const totalBalance = readInteger(
  totalBalanceResult,
  'totalBalance',
);
const distributionPaused = readBoolean(
  pausedResult,
  'isDistributionPaused',
);
const contractVersion = readString(versionResult, 'version');
const effectiveRewardPool = rewardsPoolEnabled
  ? rewardsPoolBalance
  : availableFunds;

const failures = [];
if (teamAllocationPercentage !== EXPECTED_TEAM_PERCENTAGE) {
  failures.push(
    `Expected team allocation ${EXPECTED_TEAM_PERCENTAGE}% but found ${teamAllocationPercentage}%.`,
  );
}
if (100n - teamAllocationPercentage !== EXPECTED_USER_PERCENTAGE) {
  failures.push(
    `Expected user reward allocation ${EXPECTED_USER_PERCENTAGE}% but found ${100n - teamAllocationPercentage}%.`,
  );
}
if (!rewardDistributors.includes(appAdmin)) {
  failures.push(
    'The app admin is not also registered as a reward distributor, so the VeInvite operator gate cannot pass.',
  );
}
if (effectiveRewardPool > totalBalance) {
  failures.push(
    'The effective reward pool exceeds the total X2EarnRewardsPool app balance.',
  );
}

console.log(
  JSON.stringify(
    {
      network: config.network,
      appId: VEINVITE_APP_ID,
      policy: {
        expectedTeamAllocationPercentage: EXPECTED_TEAM_PERCENTAGE.toString(),
        expectedUserRewardPercentage: EXPECTED_USER_PERCENTAGE.toString(),
        actualTeamAllocationPercentage: teamAllocationPercentage.toString(),
        actualUserRewardPercentage: (100n - teamAllocationPercentage).toString(),
      },
      operatorConfiguration: {
        rewardDistributorCount: rewardDistributors.length,
        appAdminIsRewardDistributor: rewardDistributors.includes(appAdmin),
      },
      pool: {
        rewardsPoolEnabled,
        distributionPaused,
        contractVersion,
        effectiveRewardPoolWei: effectiveRewardPool.toString(),
        totalBalanceWei: totalBalance.toString(),
      },
      passed: failures.length === 0,
      failures,
      writesPerformed: false,
      transfersPerformed: false,
    },
    null,
    2,
  ),
);

if (failures.length > 0) {
  throw new Error(`Mainnet reward configuration audit failed: ${failures.join(' ')}`);
}
