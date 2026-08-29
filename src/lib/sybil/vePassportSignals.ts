import { ThorClient } from '@vechain/sdk-network';

import { supabaseAdmin } from '@/lib/supabaseServer';
import type {
  SybilDecision,
  SybilRiskLevel,
  SybilStatus,
} from '@/lib/sybil/risk';
import {
  getVeBetterNetworkConfig,
  type VeBetterNetwork,
} from '@/lib/vebetter/network';

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const DEFAULT_REVIEW_THRESHOLD = 2;

const REVIEWED_PASSPORT_ADDRESSES: Record<
  VeBetterNetwork,
  string
> = {
  mainnet:
    '0x35a267671d8EDD607B2056A9a13E7ba7CF53c8b3',
  testnet:
    '0x4d0882e0a38daabb395cbe869db9405ea5860d7b',
  'testnet-staging':
    '0x592c756df7a5d39de1735030e8b9c18b7417e6c4',
};

const veBetterPassportAbi = [
  {
    inputs: [],
    name: 'signalingThreshold',
    outputs: [{ name: '', type: 'uint256' }],
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
] as const;

export type VePassportSignalSnapshot = {
  walletAddress: string;
  network: VeBetterNetwork;
  passportAddress: string;
  signalCount: number;
  protocolSignalThreshold: number;
  veInviteReviewThreshold: number;
  blacklisted: boolean;
  checkedAt: string;
};

type QueuedInvitationRow = {
  invite_code: string;
  invitee_wallet: string | null;
  status: string;
  sybil_status: SybilStatus;
  sybil_risk_level: SybilRiskLevel;
  sybil_risk_score: number;
  sybil_reason: string | null;
  sybil_source: string;
};

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

export function evaluateVePassportSignalRisk(
  snapshot: Pick<
    VePassportSignalSnapshot,
    | 'signalCount'
    | 'veInviteReviewThreshold'
    | 'blacklisted'
  >,
): SybilDecision {
  if (snapshot.blacklisted) {
    return {
      status: 'BLOCKED',
      riskLevel: 'HIGH',
      riskScore: 100,
      reason:
        'VePassport reports this wallet as blacklisted.',
      source: 'VEPASSPORT',
    };
  }

  if (
    snapshot.signalCount >=
    snapshot.veInviteReviewThreshold
  ) {
    return {
      status: 'REVIEW',
      riskLevel: 'HIGH',
      riskScore: Math.min(
        99,
        60 + snapshot.signalCount * 10,
      ),
      reason:
        `VePassport signal count ${snapshot.signalCount} reached the VeInvite review threshold ${snapshot.veInviteReviewThreshold}.`,
      source: 'VEPASSPORT',
    };
  }

  if (snapshot.signalCount > 0) {
    return {
      status: 'CLEAR',
      riskLevel: 'LOW',
      riskScore: Math.min(
        49,
        snapshot.signalCount * 20,
      ),
      reason:
        `VePassport signal count ${snapshot.signalCount} remains below the VeInvite review threshold ${snapshot.veInviteReviewThreshold}.`,
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

export async function readVePassportSignalSnapshot(
  walletAddress: string,
): Promise<VePassportSignalSnapshot> {
  if (!ADDRESS_PATTERN.test(walletAddress)) {
    throw new Error(
      'VePassport signal check received an invalid wallet address.',
    );
  }

  const {
    network,
    nodeUrl,
  } = getVeBetterNetworkConfig();
  const passportAddress =
    REVIEWED_PASSPORT_ADDRESSES[network];
  const thor = ThorClient.at(nodeUrl);
  const contract = thor.contracts.load(
    passportAddress,
    veBetterPassportAbi,
  );

  const [
    signalResult,
    thresholdResult,
    blacklistedResult,
  ] = await Promise.all([
    contract.read.signaledCounter(
      walletAddress,
    ),
    contract.read.signalingThreshold(),
    contract.read.isBlacklisted(
      walletAddress,
    ),
  ]);

  return {
    walletAddress:
      walletAddress.toLowerCase(),
    network,
    passportAddress,
    signalCount: toSafeInteger(
      signalResult[0],
      'VePassport signaledCounter',
    ),
    protocolSignalThreshold:
      toSafeInteger(
        thresholdResult[0],
        'VePassport signalingThreshold',
      ),
    veInviteReviewThreshold:
      getVeInviteReviewThreshold(),
    blacklisted: toBoolean(
      blacklistedResult[0],
      'VePassport isBlacklisted',
    ),
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Re-check every currently queued referral against the shared VePassport
 * signal/blacklist state immediately before a reward round is reserved.
 *
 * Existing operator REVIEW/BLOCKED decisions are never cleared here because
 * only referrals already marked CLEAR are selected. Any VePassport read
 * failure throws and prevents reward-round preparation (fail closed).
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
      .select('invite_code')
      .eq('network', network)
      .eq('status', 'QUEUED')
      .is('assigned_round_id', null);

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
        'invite_code, invitee_wallet, status, sybil_status, sybil_risk_level, sybil_risk_score, sybil_reason, sybil_source',
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

  let checkedCount = 0;
  let clearCount = 0;
  let reviewCount = 0;
  let blockedCount = 0;

  for (const value of invitationResult.data ?? []) {
    const row =
      value as QueuedInvitationRow;

    if (
      !row.invitee_wallet ||
      !ADDRESS_PATTERN.test(
        row.invitee_wallet,
      )
    ) {
      throw new Error(
        `Queued invitation ${row.invite_code} is missing a valid invitee wallet.`,
      );
    }

    const snapshot =
      await readVePassportSignalSnapshot(
        row.invitee_wallet,
      );

    if (snapshot.network !== network) {
      throw new Error(
        `VePassport network mismatch for invitation ${row.invite_code}.`,
      );
    }

    const decision =
      evaluateVePassportSignalRisk(
        snapshot,
      );
    const nextStatus =
      decision.status === 'CLEAR'
        ? 'COMPLETED'
        : 'UNDER_REVIEW';

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
          sybil_checked_at:
            snapshot.checkedAt,
          sybil_source:
            decision.source,
        })
        .eq('invite_code', row.invite_code)
        .eq('status', 'COMPLETED')
        .eq('sybil_status', 'CLEAR');

    if (updateResult.error) {
      throw new Error(
        `VePassport decision could not be persisted for invitation ${row.invite_code}: ${updateResult.error.message}`,
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
