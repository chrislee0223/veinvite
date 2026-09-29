import { ThorClient } from '@vechain/sdk-network';

import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  combineReferralPartySybilDecisions,
  type SybilDecision,
  type SybilRiskLevel,
  type SybilStatus,
} from '@/lib/sybil/risk';
import {
  getVeBetterNetworkConfig,
  type VeBetterNetwork,
} from '@/lib/vebetter/network';

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const DEFAULT_REVIEW_THRESHOLD = 2;
const PASSPORT_WALLET_BATCH_SIZE = 8;

const veBetterPassportAbi = [
  {
    inputs: [],
    name: 'version',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'pure',
    type: 'function',
  },
  {
    inputs: [],
    name: 'signalingThreshold',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'thresholdPoPScore',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'roundsForCumulativeScore',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'check', type: 'uint8' }],
    name: 'isCheckEnabled',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: '_user', type: 'address' }],
    name: 'signaledCounter',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: '_user', type: 'address' }],
    name: 'isBlacklisted',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'passport', type: 'address' }],
    name: 'isPassportBlacklisted',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'user', type: 'address' }],
    name: 'isEntity',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'user', type: 'address' }],
    name: 'isPassport',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'entity', type: 'address' }],
    name: 'getPassportForEntity',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'passport', type: 'address' }],
    name: 'getEntitiesLinkedToPassport',
    outputs: [{ name: '', type: 'address[]' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'delegator', type: 'address' }],
    name: 'getDelegatee',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'delegatee', type: 'address' }],
    name: 'getDelegator',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'user', type: 'address' }],
    name: 'userTotalScore',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'lastRound', type: 'uint256' },
    ],
    name: 'getCumulativeScoreWithDecay',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'round', type: 'uint256' },
    ],
    name: 'userRoundActionCount',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'round', type: 'uint256' },
    ],
    name: 'userRoundAppCount',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'user', type: 'address' }],
    name: 'isPerson',
    outputs: [
      { name: 'person', type: 'bool' },
      { name: 'reason', type: 'string' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

const xAllocationVotingAbi = [
  {
    inputs: [],
    name: 'currentRoundId',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export type VePassportPartySnapshot = {
  walletAddress: string;
  resolvedPassport: string;
  isEntity: boolean;
  isPassport: boolean;
  linkedEntities: string[];
  delegatee: string | null;
  delegator: string | null;
  signalCount: number;
  blacklisted: boolean;
  passportBlacklisted: boolean;
  totalScore: number;
  cumulativeScore: number;
  isPerson: boolean;
  personReason: string;
  preActivationActionCount: number;
  preActivationAppCount: number;
};

export type VePassportReferralSnapshot = {
  network: VeBetterNetwork;
  passportAddress: string;
  passportVersion: string;
  checkedAt: string;
  currentRoundId: number;
  activationRoundId: number | null;
  roundsForCumulativeScore: number;
  participationThreshold: number;
  protocolSignalThreshold: number;
  veInviteReviewThreshold: number;
  enabledChecks: {
    blacklist: boolean;
    signaling: boolean;
    participation: boolean;
  };
  inviter: VePassportPartySnapshot;
  invitee: VePassportPartySnapshot;
  sameResolvedPassport: boolean;
};

export type VePassportSignalSnapshot = {
  walletAddress: string;
  network: VeBetterNetwork;
  passportAddress: string;
  signalCount: number;
  protocolSignalThreshold: number;
  veInviteReviewThreshold: number;
  signalingCheckEnabled: boolean;
  blacklistCheckEnabled: boolean;
  blacklisted: boolean;
  checkedAt: string;
};

type QueuedInvitationRow = {
  invite_code: string;
  inviter_wallet: string;
  invitee_wallet: string | null;
  status: string;
  sybil_status: SybilStatus;
  sybil_risk_level: SybilRiskLevel;
  sybil_risk_score: number;
  sybil_reason: string | null;
  sybil_source: string;
};

function toAddress(
  value: unknown,
  label: string,
): string {
  if (
    typeof value !== 'string' ||
    !ADDRESS_PATTERN.test(value)
  ) {
    throw new Error(
      `${label} returned an invalid address.`,
    );
  }

  return value.toLowerCase();
}

function toOptionalAddress(
  value: unknown,
  label: string,
): string | null {
  const address = toAddress(value, label);
  return address === ZERO_ADDRESS
    ? null
    : address;
}

function toStringValue(
  value: unknown,
  label: string,
): string {
  if (typeof value !== 'string') {
    throw new Error(
      `${label} returned an invalid string value.`,
    );
  }

  return value;
}

function toAddressArray(
  value: unknown,
  label: string,
): string[] {
  if (!Array.isArray(value)) {
    throw new Error(
      `${label} returned an invalid address array.`,
    );
  }

  return value.map((entry) =>
    toAddress(entry, label),
  );
}

function toSafeInteger(
  value: unknown,
  label: string,
): number {
  let parsed: number;

  if (typeof value === 'bigint') {
    parsed = Number(value);
  } else if (typeof value === 'number') {
    parsed = value;
  } else if (
    typeof value === 'string' &&
    /^\d+$/.test(value)
  ) {
    parsed = Number(value);
  } else {
    throw new Error(
      `${label} returned an unsupported chain value.`,
    );
  }

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 0
  ) {
    throw new Error(
      `${label} is not a safe non-negative integer.`,
    );
  }

  return parsed;
}

function toBoolean(
  value: unknown,
  label: string,
): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(
      `${label} returned an invalid boolean value.`,
    );
  }

  return value;
}

function normalizeCheckedWallet(
  walletAddress: string,
): string {
  if (!ADDRESS_PATTERN.test(walletAddress)) {
    throw new Error(
      'VePassport signal check received an invalid wallet address.',
    );
  }

  return walletAddress.toLowerCase();
}

function getVeInviteReviewThreshold(): number {
  const raw =
    process.env.VEINVITE_SIGNAL_REVIEW_THRESHOLD;

  if (!raw) {
    return DEFAULT_REVIEW_THRESHOLD;
  }

  const parsed = Number(raw);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 1 ||
    parsed > 100
  ) {
    throw new Error(
      'VEINVITE_SIGNAL_REVIEW_THRESHOLD must be an integer between 1 and 100.',
    );
  }

  return parsed;
}

function effectiveSignalThreshold(
  snapshot: Pick<
    VePassportSignalSnapshot,
    | 'protocolSignalThreshold'
    | 'veInviteReviewThreshold'
  >,
): number {
  // Never let an app-specific setting weaken the shared VePassport policy.
  // If the protocol exposes a positive threshold, use the stricter of the
  // protocol and VeInvite values. A zero protocol threshold is treated as
  // unset to avoid turning every wallet into an automatic review.
  if (snapshot.protocolSignalThreshold > 0) {
    return Math.min(
      snapshot.protocolSignalThreshold,
      snapshot.veInviteReviewThreshold,
    );
  }

  return snapshot.veInviteReviewThreshold;
}

export function evaluateVePassportSignalRisk(
  snapshot: Pick<
    VePassportSignalSnapshot,
    | 'signalCount'
    | 'protocolSignalThreshold'
    | 'veInviteReviewThreshold'
    | 'signalingCheckEnabled'
    | 'blacklistCheckEnabled'
    | 'blacklisted'
  >,
): SybilDecision {
  if (
    snapshot.blacklistCheckEnabled &&
    snapshot.blacklisted
  ) {
    return {
      status: 'BLOCKED',
      riskLevel: 'HIGH',
      riskScore: 100,
      reason:
        'VePassport reports this wallet as blacklisted.',
      source: 'VEPASSPORT',
    };
  }

  const reviewThreshold =
    effectiveSignalThreshold(snapshot);

  if (
    snapshot.signalingCheckEnabled &&
    snapshot.signalCount >=
      reviewThreshold
  ) {
    return {
      status: 'REVIEW',
      riskLevel: 'HIGH',
      riskScore: Math.min(
        99,
        60 + snapshot.signalCount * 10,
      ),
      reason:
        `VePassport signal count ${snapshot.signalCount} reached the effective review threshold ${reviewThreshold}.`,
      source: 'VEPASSPORT',
    };
  }

  if (
    snapshot.signalCount > 0 ||
    snapshot.blacklisted
  ) {
    return {
      status: 'CLEAR',
      riskLevel: 'LOW',
      riskScore: Math.min(
        49,
        snapshot.signalCount * 20 +
          (snapshot.blacklisted ? 10 : 0),
      ),
      reason:
        !snapshot.signalingCheckEnabled &&
        snapshot.signalCount > 0
          ? 'VePassport signaling is currently disabled by the protocol; the signal is retained as observation-only context.'
          : !snapshot.blacklistCheckEnabled &&
              snapshot.blacklisted
            ? 'VePassport blacklist checking is currently disabled by the protocol; the blacklist value is retained as observation-only context.'
            : `VePassport signal count ${snapshot.signalCount} remains below the effective review threshold ${reviewThreshold}.`,
      source: 'VEPASSPORT',
    };
  }

  return {
    status: 'CLEAR',
    riskLevel: 'NONE',
    riskScore: 0,
    reason: null,
    source: 'VEPASSPORT',
  };
}

async function readVePassportSignalSnapshots(
  walletAddresses: string[],
): Promise<Map<string, VePassportSignalSnapshot>> {
  const normalizedWallets = Array.from(
    new Set(
      walletAddresses.map(normalizeCheckedWallet),
    ),
  );

  if (normalizedWallets.length === 0) {
    return new Map();
  }

  const {
    network,
    nodeUrl,
    veBetterPassportAddress:
      passportAddress,
  } = getVeBetterNetworkConfig();
  const thor = ThorClient.at(nodeUrl);
  const contract = thor.contracts.load(
    passportAddress,
    veBetterPassportAbi,
  );
  const [
    thresholdResult,
    signalingCheckResult,
    blacklistCheckResult,
  ] = await Promise.all([
    contract.read.signalingThreshold(),
    contract.read.isCheckEnabled(3),
    contract.read.isCheckEnabled(2),
  ]);
  const protocolSignalThreshold =
    toSafeInteger(
      thresholdResult[0],
      'VePassport signalingThreshold',
    );
  const signalingCheckEnabled =
    toBoolean(
      signalingCheckResult[0],
      'VePassport signaling check',
    );
  const blacklistCheckEnabled =
    toBoolean(
      blacklistCheckResult[0],
      'VePassport blacklist check',
    );
  const veInviteReviewThreshold =
    getVeInviteReviewThreshold();
  const checkedAt = new Date().toISOString();
  const snapshots =
    new Map<string, VePassportSignalSnapshot>();

  // Bound RPC fan-out so a large reward queue cannot create an unbounded
  // request burst against the VeChain node. The protocol threshold is read
  // once per preflight run rather than once per wallet.
  for (
    let offset = 0;
    offset < normalizedWallets.length;
    offset += PASSPORT_WALLET_BATCH_SIZE
  ) {
    const batch = normalizedWallets.slice(
      offset,
      offset + PASSPORT_WALLET_BATCH_SIZE,
    );
    const batchSnapshots = await Promise.all(
      batch.map(async (walletAddress) => {
        const [
          signalResult,
          blacklistedResult,
        ] = await Promise.all([
          contract.read.signaledCounter(
            walletAddress,
          ),
          contract.read.isBlacklisted(
            walletAddress,
          ),
        ]);

        return {
          walletAddress,
          network,
          passportAddress,
          signalCount: toSafeInteger(
            signalResult[0],
            'VePassport signaledCounter',
          ),
          protocolSignalThreshold,
          veInviteReviewThreshold,
          signalingCheckEnabled,
          blacklistCheckEnabled,
          blacklisted: toBoolean(
            blacklistedResult[0],
            'VePassport isBlacklisted',
          ),
          checkedAt,
        } satisfies VePassportSignalSnapshot;
      }),
    );

    for (const snapshot of batchSnapshots) {
      snapshots.set(
        snapshot.walletAddress,
        snapshot,
      );
    }
  }

  return snapshots;
}

export async function readVePassportSignalSnapshot(
  walletAddress: string,
): Promise<VePassportSignalSnapshot> {
  const normalizedWallet =
    normalizeCheckedWallet(walletAddress);
  const snapshots =
    await readVePassportSignalSnapshots([
      normalizedWallet,
    ]);
  const snapshot =
    snapshots.get(normalizedWallet);

  if (!snapshot) {
    throw new Error(
      'VePassport signal snapshot could not be loaded.',
    );
  }

  return snapshot;
}

function loadVePassportContract(
  thor: ReturnType<typeof ThorClient.at>,
  passportAddress: string,
) {
  return thor.contracts.load(
    passportAddress,
    veBetterPassportAbi,
  );
}

type VePassportReadContract =
  ReturnType<typeof loadVePassportContract>;

async function readVePassportPartySnapshot({
  contract,
  walletAddress,
  currentRoundId,
  activationRoundId,
  roundsForCumulativeScore,
}: {
  contract: VePassportReadContract;
  walletAddress: string;
  currentRoundId: number;
  activationRoundId: number | null;
  roundsForCumulativeScore: number;
}): Promise<VePassportPartySnapshot> {
  const [
    entityResult,
    passportResult,
    resolvedPassportResult,
    delegateeResult,
    delegatorResult,
    signalResult,
    blacklistedResult,
    totalScoreResult,
    cumulativeScoreResult,
    personResult,
  ] = await Promise.all([
    contract.read.isEntity(walletAddress),
    contract.read.isPassport(walletAddress),
    contract.read.getPassportForEntity(walletAddress),
    contract.read.getDelegatee(walletAddress),
    contract.read.getDelegator(walletAddress),
    contract.read.signaledCounter(walletAddress),
    contract.read.isBlacklisted(walletAddress),
    contract.read.userTotalScore(walletAddress),
    contract.read.getCumulativeScoreWithDecay(
      walletAddress,
      BigInt(currentRoundId),
    ),
    contract.read.isPerson(walletAddress),
  ]);

  const resolvedPassport = toAddress(
    resolvedPassportResult[0],
    'VePassport getPassportForEntity',
  );
  const [
    linkedEntitiesResult,
    passportBlacklistedResult,
  ] = await Promise.all([
    contract.read.getEntitiesLinkedToPassport(
      resolvedPassport,
    ),
    contract.read.isPassportBlacklisted(
      resolvedPassport,
    ),
  ]);

  let preActivationActionCount = 0;
  let preActivationAppCount = 0;

  if (
    activationRoundId !== null &&
    activationRoundId > 1
  ) {
    const startRound = Math.max(
      1,
      activationRoundId -
        roundsForCumulativeScore,
    );

    for (
      let round = startRound;
      round < activationRoundId;
      round += 1
    ) {
      const [
        actionsResult,
        appsResult,
      ] = await Promise.all([
        contract.read.userRoundActionCount(
          walletAddress,
          BigInt(round),
        ),
        contract.read.userRoundAppCount(
          walletAddress,
          BigInt(round),
        ),
      ]);

      preActivationActionCount +=
        toSafeInteger(
          actionsResult[0],
          'VePassport userRoundActionCount',
        );
      preActivationAppCount +=
        toSafeInteger(
          appsResult[0],
          'VePassport userRoundAppCount',
        );
    }
  }

  return {
    walletAddress,
    resolvedPassport,
    isEntity: toBoolean(
      entityResult[0],
      'VePassport isEntity',
    ),
    isPassport: toBoolean(
      passportResult[0],
      'VePassport isPassport',
    ),
    linkedEntities: toAddressArray(
      linkedEntitiesResult[0],
      'VePassport getEntitiesLinkedToPassport',
    ),
    delegatee: toOptionalAddress(
      delegateeResult[0],
      'VePassport getDelegatee',
    ),
    delegator: toOptionalAddress(
      delegatorResult[0],
      'VePassport getDelegator',
    ),
    signalCount: toSafeInteger(
      signalResult[0],
      'VePassport signaledCounter',
    ),
    blacklisted: toBoolean(
      blacklistedResult[0],
      'VePassport isBlacklisted',
    ),
    passportBlacklisted: toBoolean(
      passportBlacklistedResult[0],
      'VePassport isPassportBlacklisted',
    ),
    totalScore: toSafeInteger(
      totalScoreResult[0],
      'VePassport userTotalScore',
    ),
    cumulativeScore: toSafeInteger(
      cumulativeScoreResult[0],
      'VePassport getCumulativeScoreWithDecay',
    ),
    isPerson: toBoolean(
      personResult[0],
      'VePassport isPerson',
    ),
    personReason: toStringValue(
      personResult[1],
      'VePassport isPerson reason',
    ),
    preActivationActionCount,
    preActivationAppCount,
  };
}

export async function readVePassportReferralSnapshot({
  inviterWallet,
  inviteeWallet,
  activationRoundId = null,
}: {
  inviterWallet: string;
  inviteeWallet: string;
  activationRoundId?: number | null;
}): Promise<VePassportReferralSnapshot> {
  const normalizedInviter =
    normalizeCheckedWallet(inviterWallet);
  const normalizedInvitee =
    normalizeCheckedWallet(inviteeWallet);

  const {
    network,
    nodeUrl,
    veBetterPassportAddress,
    xAllocationVotingAddress,
  } = getVeBetterNetworkConfig();

  const thor = ThorClient.at(nodeUrl);
  const passport =
    loadVePassportContract(
      thor,
      veBetterPassportAddress,
    );
  const allocationVoting = thor.contracts.load(
    xAllocationVotingAddress,
    xAllocationVotingAbi,
  );

  const [
    versionResult,
    currentRoundResult,
    participationThresholdResult,
    roundsResult,
    signalThresholdResult,
    blacklistCheckResult,
    signalingCheckResult,
    participationCheckResult,
  ] = await Promise.all([
    passport.read.version(),
    allocationVoting.read.currentRoundId(),
    passport.read.thresholdPoPScore(),
    passport.read.roundsForCumulativeScore(),
    passport.read.signalingThreshold(),
    passport.read.isCheckEnabled(2),
    passport.read.isCheckEnabled(3),
    passport.read.isCheckEnabled(4),
  ]);

  const currentRoundId = toSafeInteger(
    currentRoundResult[0],
    'XAllocationVoting currentRoundId',
  );
  const roundsForCumulativeScore =
    toSafeInteger(
      roundsResult[0],
      'VePassport roundsForCumulativeScore',
    );
  const protocolSignalThreshold =
    toSafeInteger(
      signalThresholdResult[0],
      'VePassport signalingThreshold',
    );

  const [inviter, invitee] =
    await Promise.all([
      readVePassportPartySnapshot({
        contract: passport,
        walletAddress: normalizedInviter,
        currentRoundId,
        activationRoundId,
        roundsForCumulativeScore,
      }),
      readVePassportPartySnapshot({
        contract: passport,
        walletAddress: normalizedInvitee,
        currentRoundId,
        activationRoundId,
        roundsForCumulativeScore,
      }),
    ]);

  return {
    network,
    passportAddress:
      veBetterPassportAddress.toLowerCase(),
    passportVersion: toStringValue(
      versionResult[0],
      'VePassport version',
    ),
    checkedAt: new Date().toISOString(),
    currentRoundId,
    activationRoundId,
    roundsForCumulativeScore,
    participationThreshold:
      toSafeInteger(
        participationThresholdResult[0],
        'VePassport thresholdPoPScore',
      ),
    protocolSignalThreshold,
    veInviteReviewThreshold:
      getVeInviteReviewThreshold(),
    enabledChecks: {
      blacklist: toBoolean(
        blacklistCheckResult[0],
        'VePassport blacklist check',
      ),
      signaling: toBoolean(
        signalingCheckResult[0],
        'VePassport signaling check',
      ),
      participation: toBoolean(
        participationCheckResult[0],
        'VePassport participation check',
      ),
    },
    inviter,
    invitee,
    sameResolvedPassport:
      normalizedInviter !==
        normalizedInvitee &&
      inviter.resolvedPassport ===
        invitee.resolvedPassport,
  };
}

/**
 * Re-check only legacy queued referrals against the shared VePassport
 * signal/blacklist state immediately before a reward round is reserved.
 *
 * Sybil v2 rows already carry an immutable pre-Claim clearance. Re-checking
 * them here would violate the Claim boundary by allowing a later signal to
 * revoke a reward after AWAITING_CLAIM was exposed.
 *
 * Both the inviter (the B3TR recipient) and invitee (the mission actor) are
 * checked. A stricter decision on either party wins. Existing operator
 * REVIEW/BLOCKED decisions are never cleared here because only referrals
 * already marked CLEAR are selected. Any missing queue evidence or VePassport
 * read failure throws and prevents reward-round preparation (fail closed).
 */
export async function refreshQueuedReferralSignalChecks({
  network,
}: {
  network: VeBetterNetwork;
}): Promise<{
  checkedCount: number;
  clearCount: number;
  reviewCount: number;
  blockedCount: number;
}> {
  const queueResult =
    await supabaseAdmin
      .from('reward_queue_entries')
      .select('invite_code, sybil_clearance_id')
      .eq('network', network)
      .eq('status', 'QUEUED')
      .is('assigned_round_id', null)
      .is('sybil_clearance_id', null);

  if (queueResult.error) {
    throw new Error(
      `Queued reward candidates could not be loaded for VePassport checks: ${queueResult.error.message}`,
    );
  }

  const inviteCodes = Array.from(
    new Set(
      (queueResult.data ?? [])
        .map((row) => row.invite_code)
        .filter(
          (code): code is string =>
            typeof code === 'string' &&
            code.length > 0,
        ),
    ),
  );

  if (inviteCodes.length === 0) {
    return {
      checkedCount: 0,
      clearCount: 0,
      reviewCount: 0,
      blockedCount: 0,
    };
  }

  const invitationResult =
    await supabaseAdmin
      .from('invitations')
      .select(
        'invite_code, inviter_wallet, invitee_wallet, status, sybil_status, sybil_risk_level, sybil_risk_score, sybil_reason, sybil_source',
      )
      .in('invite_code', inviteCodes)
      .eq('activation_network', network)
      .eq('status', 'COMPLETED')
      .eq('sybil_status', 'CLEAR');

  if (invitationResult.error) {
    throw new Error(
      `Queued invitations could not be loaded for VePassport checks: ${invitationResult.error.message}`,
    );
  }

  const invitationRows =
    (invitationResult.data ?? []) as QueuedInvitationRow[];
  const loadedInviteCodes = new Set(
    invitationRows.map((row) => row.invite_code),
  );
  const missingInviteCodes = inviteCodes.filter(
    (code) => !loadedInviteCodes.has(code),
  );

  if (missingInviteCodes.length > 0) {
    throw new Error(
      `Queued reward candidates changed before VePassport preflight: ${missingInviteCodes.join(', ')}.`,
    );
  }

  const walletsToCheck: string[] = [];

  for (const row of invitationRows) {
    const inviterWallet =
      normalizeCheckedWallet(row.inviter_wallet);

    if (!row.invitee_wallet) {
      throw new Error(
        `Queued invitation ${row.invite_code} is missing an invitee wallet.`,
      );
    }

    const inviteeWallet =
      normalizeCheckedWallet(row.invitee_wallet);

    if (inviterWallet === inviteeWallet) {
      throw new Error(
        `Queued invitation ${row.invite_code} resolves to a self-invite at payout preflight.`,
      );
    }

    walletsToCheck.push(
      inviterWallet,
      inviteeWallet,
    );
  }

  const snapshots =
    await readVePassportSignalSnapshots(
      walletsToCheck,
    );

  let checkedCount = 0;
  let clearCount = 0;
  let reviewCount = 0;
  let blockedCount = 0;

  for (const row of invitationRows) {
    const inviterWallet =
      row.inviter_wallet.toLowerCase();
    const inviteeWallet =
      row.invitee_wallet?.toLowerCase() ?? '';
    const inviterSnapshot =
      snapshots.get(inviterWallet);
    const inviteeSnapshot =
      snapshots.get(inviteeWallet);

    if (!inviterSnapshot || !inviteeSnapshot) {
      throw new Error(
        `VePassport party snapshot is missing for invitation ${row.invite_code}.`,
      );
    }

    if (
      inviterSnapshot.network !== network ||
      inviteeSnapshot.network !== network
    ) {
      throw new Error(
        `VePassport network mismatch for invitation ${row.invite_code}.`,
      );
    }

    const decision =
      combineReferralPartySybilDecisions({
        inviter:
          evaluateVePassportSignalRisk(
            inviterSnapshot,
          ),
        invitee:
          evaluateVePassportSignalRisk(
            inviteeSnapshot,
          ),
      });
    const nextStatus =
      decision.status === 'CLEAR'
        ? 'COMPLETED'
        : 'UNDER_REVIEW';
    const checkedAt =
      inviterSnapshot.checkedAt >=
      inviteeSnapshot.checkedAt
        ? inviterSnapshot.checkedAt
        : inviteeSnapshot.checkedAt;

    const updateResult =
      await supabaseAdmin
        .from('invitations')
        .update({
          status: nextStatus,
          sybil_status:
            decision.status,
          sybil_risk_level:
            decision.riskLevel,
          sybil_risk_score:
            decision.riskScore,
          sybil_reason:
            decision.reason,
          sybil_checked_at: checkedAt,
          sybil_source:
            decision.source,
        })
        .eq('invite_code', row.invite_code)
        .eq('status', 'COMPLETED')
        .eq('sybil_status', 'CLEAR')
        .select('invite_code')
        .maybeSingle();

    if (updateResult.error) {
      throw new Error(
        `VePassport decision could not be persisted for invitation ${row.invite_code}: ${updateResult.error.message}`,
      );
    }

    if (!updateResult.data) {
      throw new Error(
        `Invitation ${row.invite_code} changed during VePassport payout preflight.`,
      );
    }

    checkedCount += 1;

    if (decision.status === 'BLOCKED') {
      blockedCount += 1;
    } else if (decision.status === 'REVIEW') {
      reviewCount += 1;
    } else {
      clearCount += 1;
    }
  }

  return {
    checkedCount,
    clearCount,
    reviewCount,
    blockedCount,
  };
}
