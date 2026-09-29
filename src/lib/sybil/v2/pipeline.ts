import 'server-only';

import { ThorClient } from '@vechain/sdk-network';

import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  readOnchainFundingSnapshot,
  type OnchainFundingSnapshot,
} from '@/lib/sybil/onchainAnalytics';
import {
  readHistoricalWalletChainSnapshotV2,
  type HistoricalWalletChainSnapshotV2,
} from '@/lib/sybil/v2/historicalChain';
import {
  readRecentPreActivationFundingV2,
  type RecentPreActivationFunding,
} from '@/lib/sybil/v2/recentFunding';
import {
  detectHistoricalB3trConsolidation,
  detectHistoricalRewardCluster,
} from '@/lib/sybil/v2/clusterMath';
import {
  evaluateSybilV2Policy,
  SYBIL_V2_POLICY_VERSION,
  type SybilV2Signal,
} from '@/lib/sybil/v2/policy';
import {
  appOverlap,
  hasHighSignal,
  intervalsSimilar,
  normalizeWallet,
  safeError,
  safeNonNegativeBlock,
  safePositiveBlock,
  safeRevision,
  unique,
} from '@/lib/sybil/v2/pipelinePrimitives';
import {
  SYBIL_V2_ANALYZER_VERSION,
} from '@/lib/sybil/v2/version';
import {
  getVeBetterNetworkConfig,
  type VeBetterNetwork,
} from '@/lib/vebetter/network';

export { SYBIL_V2_ANALYZER_VERSION } from '@/lib/sybil/v2/version';
const SYBIL_V2_BEHAVIOR_ENFORCEMENT_VERSION = 'behavior-pattern-v2';

const DECISION_CHECKS = [
  'HISTORICAL_CHAIN',
  'FUNDING_CHAIN',
  'MISSION_BEHAVIOR',
  'SECURITY_IDENTITY',
] as const;

const REQUIRED_CHECKS = [
  ...DECISION_CHECKS,
  'CHAIN_FINALITY',
] as const;

const SYNC_REWARD_BLOCK_WINDOW = 30;
const DENSE_B3TR_BURST_BLOCK_WINDOW = 180;
const DENSE_B3TR_BURST_MIN_WALLETS = 6;
const DENSE_B3TR_BURST_MAX_GAP_BLOCKS = 24;
const MISSION_PEER_WINDOW_SECONDS = 7 * 24 * 60 * 60;
const FUNDER_RETURN_LOOP_MAX_BLOCKS = 12;
const FUNDER_RETURN_LOOP_MIN_WALLETS = 3;
const MAX_BATCH_SIZE = 10;
const MAX_ASSESSMENT_BATCH_SIZE = 25;
const CONFIRMED_CLUSTER_SIGNATURE_CODE =
  'SYNC_REWARD_COMMON_SINK_INVITER_V1';
const CONFIRMED_CLUSTER_LINK_CODES = [
  'HISTORICAL_COMMON_B3TR_SINK',
  'HISTORICAL_SINK_REAPPEARS_AS_INVITER',
] as const;

type InvitationV2Row = {
  invite_code: string;
  inviter_wallet: string;
  invitee_wallet: string | null;
  activation_network: VeBetterNetwork | null;
  activation_block: number | string | null;
  activated_at: string | null;
  status: string;
  reward_status: string;
  vote_completed: boolean;
  vote_completed_at: string | null;
  vote_completed_block: number | string | null;
  identity_link_status: string;
  identity_link_checked_at: string | null;
  identity_link_evidence: Record<string, unknown> | null;
};

type ScanCheckpoint = {
  invite_code: string;
  network: VeBetterNetwork;
  activation_block: number | string;
  analyzer_version: string;
  historical_chain_status: 'PENDING' | 'COMPLETE' | 'FAILED';
  funding_chain_status: 'PENDING' | 'COMPLETE' | 'FAILED';
  historical_reward_event_count: number;
  preactivation_b3tr_outflow_count: number;
  attempt_count: number;
  last_error: string | null;
  checked_at: string | null;
};

type AssessmentRow = {
  invite_code: string;
  state: string;
  revision: number | string;
  source: string;
  policy_version: string;
  updated_at: string;
  evidence_summary: Record<string, unknown> | null;
};

type HistoricalRewardRow = {
  wallet_address: string;
  app_id: string;
  block_number: number | string;
};

type HistoricalOutflowRow = {
  wallet_address: string;
  destination_wallet: string;
  block_number: number | string;
};

type FundingEvidenceRow = {
  signal_code: string;
  subject_wallet?: string;
  related_wallet: string | null;
  evidence?: Record<string, unknown> | null;
};

type WatchFollowupEvidenceRow = {
  signal_code: string;
  strength: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH';
  score: number | string;
  related_wallet: string | null;
};

type MissionFingerprintRow = {
  invite_code: string;
  inviter_wallet: string;
  invitee_wallet: string;
  activated_at: string;
  app_sequence: string[];
  reward_intervals_seconds: Array<number | string> | null;
};

type AssessmentRpcResult = {
  updated?: boolean;
  reason?: string;
  revision?: number | string;
  state?: string;
};

type ClearanceRpcResult = {
  issued?: boolean;
  reason?: string;
  clearanceId?: string;
  verdict?: string;
  assessmentRevision?: number | string;
};

type ConfirmedClusterEvidenceRow = {
  signal_code: string;
  strength: string;
  score: number | string;
  related_wallet: string | null;
};

type ConfirmedClusterHubRow = {
  wallet_address: string;
  confirmed_at: string;
};

type ConfirmedClusterBlacklistRpcResult = {
  changed?: boolean;
  state?: string;
  revision?: number | string;
  reason?: string;
};

type BehaviorPatternRestrictionRpcResult = {
  changed?: boolean;
  state?: string;
  revision?: number | string;
  reason?: string;
};

export type SybilV2EvidenceCollectionResult = {
  inviteCode: string;
  historicalChainComplete: boolean;
  fundingChainComplete: boolean;
  historicalRewardEvents: number;
  preactivationB3trOutflows: number;
  error: string | null;
};

export type SybilV2AssessmentResult = {
  inviteCode: string;
  state:
    | 'ANALYSIS_PENDING'
    | 'ANALYSIS_FAILED'
    | 'CLEAR'
    // Legacy persisted state only; v2.10 policy does not emit WATCH.
    | 'WATCH'
    | 'HOLD'
    | 'RESTRICTED';
  riskScore: number;
  reasonCodes: string[];
  revision: number | null;
  clearanceIssued: boolean;
  clearanceId: string | null;
};

function knownProtocolDestinations(): Set<string> {
  const config = getVeBetterNetworkConfig();
  return new Set([
    '0x0000000000000000000000000000000000000000',
    config.b3trAddress.toLowerCase(),
    config.vot3Address.toLowerCase(),
    config.x2EarnAppsAddress.toLowerCase(),
    config.x2EarnRewardsPoolAddress.toLowerCase(),
    config.xAllocationVotingAddress.toLowerCase(),
    // Bootstrap known service/protocol wallets. Production's DB allowlist is
    // also loaded below so future protocol additions do not require a deploy.
    '0x76ca782b59c74d088c7d2cce2f211bc00836c602', // VOT3
    '0x8692410da301a9b796b68a58ff660d51e979c6fa', // gas abstraction paymaster
    '0xf9a1bc92e0eeee598b9fdb45397107b1f05f6cc1', // VeSwap router
    '0xf21dd7108d93af56fab07423efb90f4a3604da89', // BetterSwap aggregator
  ]);
}

async function loadKnownProtocolDestinations(
  network: VeBetterNetwork,
): Promise<Set<string>> {
  const destinations = knownProtocolDestinations();
  const { data, error } = await supabaseAdmin
    .from('sybil_v2_cluster_hub_allowlist')
    .select('wallet_address')
    .eq('network', network);

  if (error) {
    throw new Error(
      `Sybil protocol allowlist could not be loaded: ${error.message}`,
    );
  }

  for (const row of data ?? []) {
    if (typeof row.wallet_address === 'string') {
      destinations.add(normalizeWallet(row.wallet_address));
    }
  }

  return destinations;
}

async function loadInvitation(inviteCode: string): Promise<InvitationV2Row | null> {
  const { data, error } = await supabaseAdmin
    .from('invitations')
    .select(
      [
        'invite_code',
        'inviter_wallet',
        'invitee_wallet',
        'activation_network',
        'activation_block',
        'activated_at',
        'status',
        'reward_status',
        'vote_completed',
        'vote_completed_at',
        'vote_completed_block',
        'identity_link_status',
        'identity_link_checked_at',
        'identity_link_evidence',
      ].join(','),
    )
    .eq('invite_code', inviteCode)
    .maybeSingle();

  if (error) {
    throw new Error(`Sybil v2 invitation could not be loaded: ${error.message}`);
  }

  return data as InvitationV2Row | null;
}

async function loadCheckpoint(inviteCode: string): Promise<ScanCheckpoint | null> {
  const { data, error } = await supabaseAdmin
    .from('sybil_v2_scan_checkpoints')
    .select('*')
    .eq('invite_code', inviteCode)
    .maybeSingle();

  if (error) {
    throw new Error(`Sybil v2 scan checkpoint could not be loaded: ${error.message}`);
  }

  return data as ScanCheckpoint | null;
}

async function saveCheckpoint({
  invitation,
  historicalStatus,
  fundingStatus,
  historicalRewardEvents,
  b3trOutflows,
  attemptCount,
  lastError,
}: {
  invitation: InvitationV2Row;
  historicalStatus: ScanCheckpoint['historical_chain_status'];
  fundingStatus: ScanCheckpoint['funding_chain_status'];
  historicalRewardEvents: number;
  b3trOutflows: number;
  attemptCount: number;
  lastError: string | null;
}) {
  const activationBlock = safePositiveBlock(invitation.activation_block);
  if (!invitation.activation_network || !activationBlock) {
    throw new Error('Sybil v2 checkpoint requires a valid activation network/block.');
  }

  const { error } = await supabaseAdmin
    .from('sybil_v2_scan_checkpoints')
    .upsert({
      invite_code: invitation.invite_code,
      network: invitation.activation_network,
      activation_block: activationBlock,
      historical_chain_status: historicalStatus,
      funding_chain_status: fundingStatus,
      historical_reward_event_count: historicalRewardEvents,
      preactivation_b3tr_outflow_count: b3trOutflows,
      attempt_count: attemptCount,
      analyzer_version: SYBIL_V2_ANALYZER_VERSION,
      last_error: lastError,
      checked_at:
        historicalStatus === 'COMPLETE' && fundingStatus === 'COMPLETE'
          ? new Date().toISOString()
          : null,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'invite_code',
    });

  if (error) {
    throw new Error(`Sybil v2 scan checkpoint could not be saved: ${error.message}`);
  }
}

async function insertEvidenceRecord({
  invitation,
  subjectWallet,
  family,
  signalCode,
  strength,
  score,
  relatedWallet = null,
  appId = null,
  observedBlock = null,
  observedAt = null,
  evidence = {},
  dedupeKey,
}: {
  invitation: InvitationV2Row;
  subjectWallet: string;
  family:
    | 'FUNDING'
    | 'HISTORICAL_REWARD'
    | 'HISTORICAL_CONSOLIDATION'
    | 'MISSION_BEHAVIOR'
    | 'SECURITY_IDENTITY'
    | 'POST_PAYOUT'
    | 'CLUSTER_LINK';
  signalCode: string;
  strength: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH';
  score: number;
  relatedWallet?: string | null;
  appId?: string | null;
  observedBlock?: number | null;
  observedAt?: string | null;
  evidence?: Record<string, unknown>;
  dedupeKey: string;
}) {
  if (!invitation.activation_network) return;

  const { error } = await supabaseAdmin
    .from('sybil_v2_evidence_records')
    .upsert({
      invite_code: invitation.invite_code,
      network: invitation.activation_network,
      subject_wallet: normalizeWallet(subjectWallet),
      evidence_family: family,
      signal_code: signalCode,
      strength,
      score,
      related_wallet: relatedWallet ? normalizeWallet(relatedWallet) : null,
      app_id: appId?.toLowerCase() ?? null,
      observed_block: observedBlock,
      observed_at: observedAt,
      analyzer_version: SYBIL_V2_ANALYZER_VERSION,
      evidence,
      dedupe_key: dedupeKey,
    }, {
      onConflict: 'dedupe_key',
      ignoreDuplicates: true,
    });

  if (error && error.code !== '23505') {
    throw new Error(`Sybil v2 evidence could not be saved: ${error.message}`);
  }
}

async function persistHistoricalSnapshot({
  invitation,
  snapshot,
}: {
  invitation: InvitationV2Row;
  snapshot: HistoricalWalletChainSnapshotV2;
}) {
  if (!invitation.activation_network) return;

  if (snapshot.rewardEvents.length > 0) {
    const { error } = await supabaseAdmin
      .from('sybil_v2_historical_reward_events')
      .upsert(
        snapshot.rewardEvents.map((event) => ({
          invite_code: invitation.invite_code,
          network: invitation.activation_network,
          wallet_address: snapshot.walletAddress,
          app_id: event.appId,
          block_number: event.blockNumber,
          block_timestamp: event.blockTimestamp,
          tx_id: event.txId,
          amount_wei: event.amountWei,
          analyzer_version: SYBIL_V2_ANALYZER_VERSION,
        })),
        {
          onConflict: 'invite_code,tx_id,app_id',
          ignoreDuplicates: true,
        },
      );

    if (error && error.code !== '23505') {
      throw new Error(`Historical reward evidence could not be saved: ${error.message}`);
    }
  }

  if (snapshot.b3trOutflows.length > 0) {
    const { error } = await supabaseAdmin
      .from('sybil_v2_preactivation_b3tr_outflows')
      .upsert(
        snapshot.b3trOutflows.map((event) => ({
          invite_code: invitation.invite_code,
          network: invitation.activation_network,
          wallet_address: snapshot.walletAddress,
          destination_wallet: event.destination,
          block_number: event.blockNumber,
          block_timestamp: event.blockTimestamp,
          tx_id: event.txId,
          amount_wei: event.amountWei,
          analyzer_version: SYBIL_V2_ANALYZER_VERSION,
        })),
        {
          onConflict: 'invite_code,tx_id,destination_wallet,amount_wei',
          ignoreDuplicates: true,
        },
      );

    if (error && error.code !== '23505') {
      throw new Error(`Historical B3TR outflow evidence could not be saved: ${error.message}`);
    }
  }
}

async function persistFundingSnapshot({
  invitation,
  snapshot,
}: {
  invitation: InvitationV2Row;
  snapshot: OnchainFundingSnapshot;
}) {
  const subject = snapshot.walletAddress;

  if (snapshot.firstInboundVet?.sender) {
    await insertEvidenceRecord({
      invitation,
      subjectWallet: subject,
      family: 'FUNDING',
      signalCode: 'FIRST_VET_FUNDER',
      strength: 'INFO',
      score: 0,
      relatedWallet: snapshot.firstInboundVet.sender,
      observedBlock: snapshot.firstInboundVet.blockNumber,
      evidence: {
        txId: snapshot.firstInboundVet.txId,
        asset: 'VET',
      },
      dedupeKey:
        `sybil-v2:${invitation.invite_code}:first-vet-funder:${snapshot.firstInboundVet.sender}`,
    });
  }

  if (snapshot.firstInboundVtho?.sender) {
    await insertEvidenceRecord({
      invitation,
      subjectWallet: subject,
      family: 'FUNDING',
      signalCode: 'FIRST_VTHO_FUNDER',
      strength: 'INFO',
      score: 0,
      relatedWallet: snapshot.firstInboundVtho.sender,
      observedBlock: snapshot.firstInboundVtho.blockNumber,
      evidence: {
        txId: snapshot.firstInboundVtho.txId,
        asset: 'VTHO',
      },
      dedupeKey:
        `sybil-v2:${invitation.invite_code}:first-vtho-funder:${snapshot.firstInboundVtho.sender}`,
    });
  }

  if (snapshot.approximateAgeSecondsAtActivation !== null) {
    await insertEvidenceRecord({
      invitation,
      subjectWallet: subject,
      family: 'FUNDING',
      signalCode: 'WALLET_ACTIVITY_AGE',
      strength: 'INFO',
      score: 0,
      observedBlock: snapshot.firstObservedActivityBlock,
      evidence: {
        ageBlocksAtActivation: snapshot.ageBlocksAtActivation,
        approximateAgeSecondsAtActivation:
          snapshot.approximateAgeSecondsAtActivation,
      },
      dedupeKey:
        `sybil-v2:${invitation.invite_code}:wallet-activity-age`,
    });
  }
}


async function persistRecentFundingSnapshot({
  invitation,
  rows,
}: {
  invitation: InvitationV2Row;
  rows: RecentPreActivationFunding[];
}) {
  if (!invitation.invitee_wallet) return;

  for (const row of rows) {
    await insertEvidenceRecord({
      invitation,
      subjectWallet: invitation.invitee_wallet,
      family: 'FUNDING',
      signalCode: `RECENT_PREACTIVATION_${row.asset}_FUNDER`,
      strength: 'INFO',
      score: 0,
      relatedWallet: row.sender,
      observedBlock: row.blockNumber,
      evidence: {
        asset: row.asset,
        txId: row.txId,
        amountWei: row.amountWei,
        blocksBeforeActivation:
          row.blocksBeforeActivation,
        approximateSecondsBeforeActivation:
          row.blocksBeforeActivation * 10,
      },
      dedupeKey:
        `sybil-v2:${invitation.invite_code}:recent-${row.asset.toLowerCase()}-funder:${row.sender}:${row.blockNumber}`,
    });
  }
}

export async function collectSybilV2EvidenceForInvite(
  inviteCode: string,
): Promise<SybilV2EvidenceCollectionResult> {
  const normalizedCode = inviteCode.trim().toUpperCase();
  const invitation = await loadInvitation(normalizedCode);

  if (
    !invitation ||
    !invitation.invitee_wallet ||
    !invitation.activation_network ||
    !safePositiveBlock(invitation.activation_block)
  ) {
    throw new Error('Sybil v2 evidence collection requires an activated invitation.');
  }

  const activationBlock = safePositiveBlock(invitation.activation_block)!;
  const previous = await loadCheckpoint(normalizedCode);

  if (
    previous &&
    previous.analyzer_version === SYBIL_V2_ANALYZER_VERSION &&
    Number(previous.activation_block) === activationBlock &&
    previous.historical_chain_status === 'COMPLETE' &&
    previous.funding_chain_status === 'COMPLETE'
  ) {
    return {
      inviteCode: normalizedCode,
      historicalChainComplete: true,
      fundingChainComplete: true,
      historicalRewardEvents: previous.historical_reward_event_count,
      preactivationB3trOutflows: previous.preactivation_b3tr_outflow_count,
      error: null,
    };
  }

  const attemptCount = (previous?.attempt_count ?? 0) + 1;
  const checkpointCurrent =
    previous?.analyzer_version === SYBIL_V2_ANALYZER_VERSION &&
    Number(previous.activation_block) === activationBlock;

  let historicalStatus: ScanCheckpoint['historical_chain_status'] =
    checkpointCurrent &&
    previous?.historical_chain_status === 'COMPLETE'
      ? 'COMPLETE'
      : 'PENDING';
  let fundingStatus: ScanCheckpoint['funding_chain_status'] =
    checkpointCurrent &&
    previous?.funding_chain_status === 'COMPLETE'
      ? 'COMPLETE'
      : 'PENDING';
  let historicalRewardEvents =
    checkpointCurrent
      ? previous?.historical_reward_event_count ?? 0
      : 0;
  let b3trOutflows =
    checkpointCurrent
      ? previous?.preactivation_b3tr_outflow_count ?? 0
      : 0;
  const errors: string[] = [];

  await saveCheckpoint({
    invitation,
    historicalStatus,
    fundingStatus,
    historicalRewardEvents,
    b3trOutflows,
    attemptCount,
    lastError: null,
  });

  if (historicalStatus !== 'COMPLETE') {
    try {
      const snapshot = await readHistoricalWalletChainSnapshotV2({
        walletAddress: invitation.invitee_wallet,
        activationBlock,
      });
      await persistHistoricalSnapshot({ invitation, snapshot });
      historicalRewardEvents = snapshot.rewardEvents.length;
      b3trOutflows = snapshot.b3trOutflows.length;
      historicalStatus = 'COMPLETE';
    } catch (error) {
      historicalStatus = 'FAILED';
      errors.push(`historical: ${safeError(error)}`);
    }
  }

  if (fundingStatus !== 'COMPLETE') {
    try {
      const [snapshot, recentFunding] = await Promise.all([
        readOnchainFundingSnapshot({
          walletAddress: invitation.invitee_wallet,
          activationBlock,
        }),
        readRecentPreActivationFundingV2({
          walletAddress: invitation.invitee_wallet,
          activationBlock,
        }),
      ]);
      await persistFundingSnapshot({ invitation, snapshot });
      await persistRecentFundingSnapshot({
        invitation,
        rows: recentFunding,
      });
      fundingStatus = 'COMPLETE';
    } catch (error) {
      fundingStatus = 'FAILED';
      errors.push(`funding: ${safeError(error)}`);
    }
  }

  const error = errors.length > 0 ? errors.join(' | ') : null;

  await saveCheckpoint({
    invitation,
    historicalStatus,
    fundingStatus,
    historicalRewardEvents,
    b3trOutflows,
    attemptCount,
    lastError: error,
  });

  return {
    inviteCode: normalizedCode,
    historicalChainComplete: historicalStatus === 'COMPLETE',
    fundingChainComplete: fundingStatus === 'COMPLETE',
    historicalRewardEvents,
    preactivationB3trOutflows: b3trOutflows,
    error,
  };
}

async function loadHistoricalRewardSignals(
  invitation: InvitationV2Row,
): Promise<SybilV2Signal[]> {
  if (!invitation.activation_network || !invitation.invitee_wallet) return [];

  const wallet = normalizeWallet(invitation.invitee_wallet);
  const ownResult = await supabaseAdmin
    .from('sybil_v2_historical_reward_events')
    .select('wallet_address,app_id,block_number')
    .eq('network', invitation.activation_network)
    .eq('wallet_address', wallet);

  if (ownResult.error) {
    throw new Error(`Historical reward signals could not be loaded: ${ownResult.error.message}`);
  }

  const ownRows = (ownResult.data ?? []) as HistoricalRewardRow[];
  const apps = unique(ownRows.map((row) => row.app_id));
  if (apps.length === 0) return [];

  const peersResult = await supabaseAdmin
    .from('sybil_v2_historical_reward_events')
    .select('wallet_address,app_id,block_number')
    .eq('network', invitation.activation_network)
    .in('app_id', apps);

  if (peersResult.error) {
    throw new Error(`Historical reward peers could not be loaded: ${peersResult.error.message}`);
  }

  const rows = ((peersResult.data ?? []) as HistoricalRewardRow[])
    .map((row) => ({
      walletAddress: normalizeWallet(row.wallet_address),
      appId: row.app_id.toLowerCase(),
      blockNumber: Number(row.block_number),
    }))
    .filter((row) => Number.isSafeInteger(row.blockNumber));

  const findings = detectHistoricalRewardCluster({
    walletAddress: wallet,
    rows,
    synchronizedBlockWindow: SYNC_REWARD_BLOCK_WINDOW,
  });

  for (const finding of findings) {
    await insertEvidenceRecord({
      invitation,
      subjectWallet: wallet,
      family: finding.signal.family,
      signalCode: finding.signal.code,
      strength: finding.signal.strength,
      score: finding.signal.score,
      appId: finding.appId,
      evidence: {
        ownRewardCount: finding.ownRewardCount,
        peerWalletCount: finding.peerWalletCount,
        synchronizedWindows: finding.synchronizedWindows,
        synchronizedPeerWalletCount:
          finding.synchronizedPeerWalletCount,
        blockWindow: SYNC_REWARD_BLOCK_WINDOW,
      },
      dedupeKey:
        `sybil-v2:${invitation.invite_code}:${finding.signal.code.toLowerCase()}:${finding.appId}`,
    });
  }

  return findings.map((finding) => finding.signal);
}

async function loadConsolidationSignals(
  invitation: InvitationV2Row,
  protocolDestinations: Set<string>,
): Promise<SybilV2Signal[]> {
  if (!invitation.activation_network || !invitation.invitee_wallet) return [];

  const wallet = normalizeWallet(invitation.invitee_wallet);
  const ownRewardResult = await supabaseAdmin
    .from('sybil_v2_historical_reward_events')
    .select('block_number')
    .eq('network', invitation.activation_network)
    .eq('wallet_address', wallet)
    .order('block_number', { ascending: true })
    .limit(1);

  if (ownRewardResult.error) {
    throw new Error(`Historical reward boundary could not be loaded: ${ownRewardResult.error.message}`);
  }

  const firstRewardBlock = Number(
    ownRewardResult.data?.[0]?.block_number ?? 0,
  );
  const minimumBlock = Number.isSafeInteger(firstRewardBlock)
    ? Math.max(0, firstRewardBlock)
    : 0;

  const ownResult = await supabaseAdmin
    .from('sybil_v2_preactivation_b3tr_outflows')
    .select('wallet_address,destination_wallet,block_number')
    .eq('network', invitation.activation_network)
    .eq('wallet_address', wallet)
    .gte('block_number', minimumBlock);

  if (ownResult.error) {
    throw new Error(`Historical B3TR consolidation could not be loaded: ${ownResult.error.message}`);
  }

  const ownRows = (ownResult.data ?? []) as HistoricalOutflowRow[];
  const destinations = unique(
    ownRows
      .map((row) => normalizeWallet(row.destination_wallet))
      .filter(
        (destination) =>
          !protocolDestinations.has(destination),
      ),
  );
  if (destinations.length === 0) return [];

  const [peerResult, inviterResult] = await Promise.all([
    supabaseAdmin
      .from('sybil_v2_preactivation_b3tr_outflows')
      .select('wallet_address,destination_wallet,block_number')
      .eq('network', invitation.activation_network)
      .gte('block_number', minimumBlock)
      .in('destination_wallet', destinations),
    supabaseAdmin
      .from('invitations')
      .select('inviter_wallet')
      .eq('activation_network', invitation.activation_network)
      .not('inviter_wallet', 'is', null),
  ]);

  if (peerResult.error) {
    throw new Error(`B3TR consolidation peers could not be loaded: ${peerResult.error.message}`);
  }
  if (inviterResult.error) {
    throw new Error(`Cluster inviter roles could not be loaded: ${inviterResult.error.message}`);
  }

  const rows = ((peerResult.data ?? []) as HistoricalOutflowRow[])
    .map((row) => ({
      walletAddress: normalizeWallet(row.wallet_address),
      destinationWallet: normalizeWallet(row.destination_wallet),
      blockNumber: Number(row.block_number),
    }))
    .filter((row) => Number.isSafeInteger(row.blockNumber));

  const inviterWallets = new Set(
    (inviterResult.data ?? [])
      .map((row) => normalizeWallet(String(row.inviter_wallet))),
  );

  const findings = detectHistoricalB3trConsolidation({
    walletAddress: wallet,
    rows,
    inviterWallets,
    knownProtocolDestinations: protocolDestinations,
    minimumBlock,
    denseBurstBlockWindow: DENSE_B3TR_BURST_BLOCK_WINDOW,
    denseBurstMinimumWallets: DENSE_B3TR_BURST_MIN_WALLETS,
    denseBurstMaximumGapBlocks: DENSE_B3TR_BURST_MAX_GAP_BLOCKS,
  });

  for (const finding of findings) {
    await insertEvidenceRecord({
      invitation,
      subjectWallet: wallet,
      family: finding.signal.family,
      signalCode: finding.signal.code,
      strength: finding.signal.strength,
      score: finding.signal.score,
      relatedWallet: finding.destinationWallet,
      evidence: {
        walletCount: finding.walletCount,
        minimumBlock,
        burstStartBlock: finding.burstStartBlock ?? null,
        burstEndBlock: finding.burstEndBlock ?? null,
        burstSpanBlocks: finding.burstSpanBlocks ?? null,
        burstMaxGapBlocks: finding.burstMaxGapBlocks ?? null,
        denseBurstBlockWindow: DENSE_B3TR_BURST_BLOCK_WINDOW,
        denseBurstMinimumWallets: DENSE_B3TR_BURST_MIN_WALLETS,
        denseBurstMaximumGapBlocks: DENSE_B3TR_BURST_MAX_GAP_BLOCKS,
      },
      dedupeKey:
        `sybil-v2:${invitation.invite_code}:${finding.signal.code.toLowerCase()}:${finding.destinationWallet}`,
    });
  }

  return findings.map((finding) => finding.signal);
}

async function loadFundingSignals(
  invitation: InvitationV2Row,
  protocolDestinations: Set<string>,
): Promise<SybilV2Signal[]> {
  if (!invitation.activation_network || !invitation.invitee_wallet) return [];

  const subject = normalizeWallet(invitation.invitee_wallet);
  const inviter = normalizeWallet(invitation.inviter_wallet);
  const ownResult = await supabaseAdmin
    .from('sybil_v2_evidence_records')
    .select('signal_code,related_wallet,evidence')
    .eq('invite_code', invitation.invite_code)
    .eq('subject_wallet', subject)
    .eq('evidence_family', 'FUNDING')
    .in('signal_code', [
      'FIRST_VET_FUNDER',
      'FIRST_VTHO_FUNDER',
      'RECENT_PREACTIVATION_VET_FUNDER',
      'RECENT_PREACTIVATION_VTHO_FUNDER',
      'RECENT_PREACTIVATION_B3TR_FUNDER',
    ]);

  if (ownResult.error) {
    throw new Error(`Funding evidence could not be loaded: ${ownResult.error.message}`);
  }

  const ownRows = (ownResult.data ?? []) as FundingEvidenceRow[];
  const signals: SybilV2Signal[] = [];

  // Preserve the deliberately weak first-funder correlation from v1.
  for (const row of ownRows.filter((candidate) =>
    ['FIRST_VET_FUNDER', 'FIRST_VTHO_FUNDER'].includes(candidate.signal_code),
  )) {
    const signalCode = row.signal_code;
    const funder = typeof row.related_wallet === 'string'
      ? normalizeWallet(row.related_wallet)
      : null;
    if (!funder) continue;
    if (protocolDestinations.has(funder)) continue;

    const peers = await supabaseAdmin
      .from('sybil_v2_evidence_records')
      .select('subject_wallet')
      .eq('network', invitation.activation_network)
      .eq('evidence_family', 'FUNDING')
      .eq('signal_code', signalCode)
      .eq('related_wallet', funder);

    if (peers.error) {
      throw new Error(`Shared funder evidence could not be loaded: ${peers.error.message}`);
    }

    const wallets = unique(
      (peers.data ?? []).map((peer) =>
        normalizeWallet(String(peer.subject_wallet)),
      ),
    );

    if (wallets.length >= 3) {
      const isVtho = signalCode === 'FIRST_VTHO_FUNDER';
      const score = isVtho
        ? Math.min(18, 6 + wallets.length * 2)
        : Math.min(28, 10 + wallets.length * 3);
      const code = isVtho
        ? 'SHARED_PREACTIVATION_VTHO_FUNDER'
        : 'SHARED_PREACTIVATION_VET_FUNDER';

      signals.push({
        code,
        family: 'FUNDING',
        strength: isVtho ? 'LOW' : 'MEDIUM',
        score,
        independentKey: funder,
      });

      await insertEvidenceRecord({
        invitation,
        subjectWallet: subject,
        family: 'FUNDING',
        signalCode: code,
        strength: isVtho ? 'LOW' : 'MEDIUM',
        score,
        relatedWallet: funder,
        evidence: {
          walletCount: wallets.length,
          asset: isVtho ? 'VTHO' : 'VET',
        },
        dedupeKey:
          `sybil-v2:${invitation.invite_code}:${code.toLowerCase()}:${funder}`,
      });
    }
  }

  const recentRows = ownRows.filter((row) =>
    row.signal_code.startsWith('RECENT_PREACTIVATION_'),
  );
  const closestByAssetFunder = new Map<string, FundingEvidenceRow>();

  for (const row of recentRows) {
    const funder = typeof row.related_wallet === 'string'
      ? normalizeWallet(row.related_wallet)
      : null;
    if (!funder) continue;
    if (protocolDestinations.has(funder)) continue;

    const key = `${row.signal_code}:${funder}`;
    const current = closestByAssetFunder.get(key);
    const blocks = Number(row.evidence?.blocksBeforeActivation ?? Number.MAX_SAFE_INTEGER);
    const currentBlocks = Number(
      current?.evidence?.blocksBeforeActivation ?? Number.MAX_SAFE_INTEGER,
    );

    if (!current || blocks < currentBlocks) {
      closestByAssetFunder.set(key, row);
    }
  }

  const recentFunders = unique(
    [...closestByAssetFunder.values()]
      .map((row) => row.related_wallet)
      .filter((value): value is string => typeof value === 'string')
      .map(normalizeWallet),
  );

  for (const row of closestByAssetFunder.values()) {
    const funder = row.related_wallet
      ? normalizeWallet(row.related_wallet)
      : null;
    if (!funder) continue;
    if (protocolDestinations.has(funder)) continue;

    const asset = row.signal_code.includes('_B3TR_')
      ? 'B3TR'
      : row.signal_code.includes('_VTHO_')
        ? 'VTHO'
        : 'VET';
    const blocksBefore = Number(
      row.evidence?.blocksBeforeActivation ?? Number.MAX_SAFE_INTEGER,
    );
    const withinHour =
      Number.isFinite(blocksBefore) && blocksBefore <= 360;
    const withinDay =
      Number.isFinite(blocksBefore) && blocksBefore <= 8_640;

    if (funder === inviter && withinDay) {
      const strength =
        asset === 'B3TR' || (asset === 'VET' && withinHour)
          ? 'MEDIUM'
          : 'LOW';
      const score =
        asset === 'B3TR'
          ? 28
          : asset === 'VET'
            ? (withinHour ? 24 : 16)
            : (withinHour ? 14 : 10);
      const code = `RECENT_${asset}_FROM_INVITER`;

      signals.push({
        code,
        family: 'FUNDING',
        strength,
        score,
        independentKey: funder,
      });

      await insertEvidenceRecord({
        invitation,
        subjectWallet: subject,
        family: 'FUNDING',
        signalCode: code,
        strength,
        score,
        relatedWallet: funder,
        observedBlock:
          typeof row.evidence?.blocksBeforeActivation === 'number'
            ? Number(invitation.activation_block) - blocksBefore
            : null,
        evidence: {
          blocksBeforeActivation: blocksBefore,
          withinHour,
          withinDay,
          asset,
        },
        dedupeKey:
          `sybil-v2:${invitation.invite_code}:${code.toLowerCase()}:${funder}`,
      });
    }

    const peerResult = await supabaseAdmin
      .from('sybil_v2_evidence_records')
      .select('subject_wallet')
      .eq('network', invitation.activation_network)
      .eq('evidence_family', 'FUNDING')
      .eq('signal_code', row.signal_code)
      .eq('related_wallet', funder);

    if (peerResult.error) {
      throw new Error(
        `Recent shared funder evidence could not be loaded: ${peerResult.error.message}`,
      );
    }

    const assetWallets = unique(
      (peerResult.data ?? []).map((peer) =>
        normalizeWallet(String(peer.subject_wallet)),
      ),
    );

    if (assetWallets.length >= 3) {
      const strength = asset === 'VTHO' ? 'LOW' : 'MEDIUM';
      const score =
        asset === 'B3TR'
          ? Math.min(40, 22 + assetWallets.length * 3)
          : asset === 'VET'
            ? Math.min(34, 18 + assetWallets.length * 3)
            : Math.min(20, 8 + assetWallets.length * 2);
      const code = `SHARED_RECENT_${asset}_FUNDER`;

      signals.push({
        code,
        family: 'FUNDING',
        strength,
        score,
        independentKey: funder,
      });

      await insertEvidenceRecord({
        invitation,
        subjectWallet: subject,
        family: 'FUNDING',
        signalCode: code,
        strength,
        score,
        relatedWallet: funder,
        evidence: {
          walletCount: assetWallets.length,
          asset,
        },
        dedupeKey:
          `sybil-v2:${invitation.invite_code}:${code.toLowerCase()}:${funder}`,
      });
    }
  }

  for (const funder of recentFunders) {
    const peerFunding = await supabaseAdmin
      .from('sybil_v2_evidence_records')
      .select('subject_wallet,signal_code')
      .eq('network', invitation.activation_network)
      .eq('evidence_family', 'FUNDING')
      .eq('related_wallet', funder)
      .like('signal_code', 'RECENT_PREACTIVATION_%_FUNDER');

    if (peerFunding.error) {
      throw new Error(
        `Recent multi-asset funder evidence could not be loaded: ${peerFunding.error.message}`,
      );
    }

    const fundedWallets = unique(
      ((peerFunding.data ?? []) as FundingEvidenceRow[])
        .map((peer) => String(peer.subject_wallet ?? ''))
        .filter(Boolean)
        .map(normalizeWallet),
    );
    const fundedAssets = unique(
      ((peerFunding.data ?? []) as FundingEvidenceRow[])
        .map((peer) => peer.signal_code)
        .map((code) =>
          code.includes('_B3TR_')
            ? 'B3TR'
            : code.includes('_VTHO_')
              ? 'VTHO'
              : 'VET',
        ),
    );

    if (fundedWallets.length >= 3) {
      const score = Math.min(42, 22 + fundedWallets.length * 3);
      signals.push({
        code: 'SHARED_RECENT_MULTI_ASSET_FUNDER',
        family: 'FUNDING',
        strength: 'MEDIUM',
        score,
        independentKey: funder,
      });

      await insertEvidenceRecord({
        invitation,
        subjectWallet: subject,
        family: 'FUNDING',
        signalCode: 'SHARED_RECENT_MULTI_ASSET_FUNDER',
        strength: 'MEDIUM',
        score,
        relatedWallet: funder,
        evidence: {
          walletCount: fundedWallets.length,
          assets: fundedAssets,
        },
        dedupeKey:
          `sybil-v2:${invitation.invite_code}:shared-recent-multi-asset-funder:${funder}`,
      });
    }

    const sinkResult = await supabaseAdmin
      .from('sybil_v2_preactivation_b3tr_outflows')
      .select('wallet_address')
      .eq('network', invitation.activation_network)
      .eq('destination_wallet', funder);

    if (sinkResult.error) {
      throw new Error(
        `Historical sink linkage could not be loaded: ${sinkResult.error.message}`,
      );
    }

    const sinkWallets = unique(
      (sinkResult.data ?? []).map((row) =>
        normalizeWallet(String(row.wallet_address)),
      ),
    );

    if (sinkWallets.length >= 3) {
      const ownFundingRows = [...closestByAssetFunder.values()]
        .filter((row) =>
          row.related_wallet &&
          normalizeWallet(row.related_wallet) === funder,
        );
      const closestBlocks = Math.min(
        ...ownFundingRows.map((row) =>
          Number(
            row.evidence?.blocksBeforeActivation ??
              Number.MAX_SAFE_INTEGER,
          ),
        ),
      );

      if (Number.isFinite(closestBlocks) && closestBlocks <= 8_640) {
        signals.push({
          code: 'RECENT_FUNDER_IS_HISTORICAL_COMMON_SINK',
          family: 'CLUSTER_LINK',
          strength: 'HIGH',
          score: Math.min(60, 38 + sinkWallets.length * 2),
          independentKey: funder,
        });

        await insertEvidenceRecord({
          invitation,
          subjectWallet: subject,
          family: 'CLUSTER_LINK',
          signalCode: 'RECENT_FUNDER_IS_HISTORICAL_COMMON_SINK',
          strength: 'HIGH',
          score: Math.min(60, 38 + sinkWallets.length * 2),
          relatedWallet: funder,
          evidence: {
            historicalSinkWalletCount: sinkWallets.length,
            blocksBeforeActivation: closestBlocks,
          },
          dedupeKey:
            `sybil-v2:${invitation.invite_code}:recent-funder-historical-sink:${funder}`,
        });
      }
    }

    if (fundedWallets.length >= 3) {
      const inviterResult = await supabaseAdmin
        .from('invitations')
        .select('invite_code')
        .eq('activation_network', invitation.activation_network)
        .eq('inviter_wallet', funder)
        .not('invitee_wallet', 'is', null);

      if (inviterResult.error) {
        throw new Error(
          `Recent funder inviter linkage could not be loaded: ${inviterResult.error.message}`,
        );
      }

      const inviterCount = (inviterResult.data ?? []).length;
      if (inviterCount >= 2) {
        const score = Math.min(
          45,
          25 + fundedWallets.length * 2 + inviterCount * 2,
        );
        signals.push({
          code: 'SHARED_RECENT_FUNDER_IS_MULTI_INVITER',
          family: 'CLUSTER_LINK',
          strength: 'MEDIUM',
          score,
          independentKey: funder,
        });

        await insertEvidenceRecord({
          invitation,
          subjectWallet: subject,
          family: 'CLUSTER_LINK',
          signalCode: 'SHARED_RECENT_FUNDER_IS_MULTI_INVITER',
          strength: 'MEDIUM',
          score,
          relatedWallet: funder,
          evidence: {
            fundedWalletCount: fundedWallets.length,
            inviterReferralCount: inviterCount,
            assets: fundedAssets,
          },
          dedupeKey:
            `sybil-v2:${invitation.invite_code}:shared-recent-funder-multi-inviter:${funder}`,
        });
      }
    }
  }

  return signals;
}

async function loadHistoricalFunderReturnLoopSignals(
  invitation: InvitationV2Row,
  protocolDestinations: Set<string>,
): Promise<SybilV2Signal[]> {
  if (!invitation.activation_network || !invitation.invitee_wallet) {
    return [];
  }

  const network = invitation.activation_network;
  const subject = normalizeWallet(invitation.invitee_wallet);

  const ownFunderResult = await supabaseAdmin
    .from('sybil_v2_evidence_records')
    .select('related_wallet,observed_block')
    .eq('invite_code', invitation.invite_code)
    .eq('network', network)
    .eq('subject_wallet', subject)
    .eq('evidence_family', 'FUNDING')
    .eq('signal_code', 'FIRST_VTHO_FUNDER')
    .not('related_wallet', 'is', null)
    .not('observed_block', 'is', null);

  if (ownFunderResult.error) {
    throw new Error(
      `Historical funder-return seed evidence could not be loaded: ${ownFunderResult.error.message}`,
    );
  }

  const candidateHubs = unique([
    ...((ownFunderResult.data ?? []) as Array<{
      related_wallet: string | null;
      observed_block: number | string | null;
    }>)
      .map((row) => row.related_wallet)
      .filter((value): value is string => typeof value === 'string')
      .map(normalizeWallet),
    subject,
  ]);

  const signals: SybilV2Signal[] = [];

  for (const hub of candidateHubs) {
    if (protocolDestinations.has(hub)) continue;

    const fundingResult = await supabaseAdmin
      .from('sybil_v2_evidence_records')
      .select('subject_wallet,observed_block')
      .eq('network', network)
      .eq('evidence_family', 'FUNDING')
      .eq('signal_code', 'FIRST_VTHO_FUNDER')
      .eq('related_wallet', hub)
      .not('observed_block', 'is', null);

    if (fundingResult.error) {
      throw new Error(
        `Historical funder-return peers could not be loaded: ${fundingResult.error.message}`,
      );
    }

    const fundingRows = (fundingResult.data ?? [])
      .map((row) => ({
        wallet: normalizeWallet(String(row.subject_wallet)),
        fundingBlock: Number(row.observed_block),
      }))
      .filter((row) => Number.isSafeInteger(row.fundingBlock));

    const fundedWallets = unique(fundingRows.map((row) => row.wallet));
    if (fundedWallets.length < FUNDER_RETURN_LOOP_MIN_WALLETS) {
      continue;
    }

    const outflowResult = await supabaseAdmin
      .from('sybil_v2_preactivation_b3tr_outflows')
      .select('wallet_address,block_number')
      .eq('network', network)
      .eq('destination_wallet', hub)
      .in('wallet_address', fundedWallets);

    if (outflowResult.error) {
      throw new Error(
        `Historical funder-return outflows could not be loaded: ${outflowResult.error.message}`,
      );
    }

    const outflowRows = (outflowResult.data ?? []).map((row) => ({
      wallet: normalizeWallet(String(row.wallet_address)),
      blockNumber: Number(row.block_number),
    }));

    const matches = fundingRows.flatMap((funding) => {
      const returnBlock = outflowRows
        .filter((outflow) =>
          outflow.wallet === funding.wallet &&
          Number.isSafeInteger(outflow.blockNumber) &&
          outflow.blockNumber >= funding.fundingBlock &&
          outflow.blockNumber - funding.fundingBlock <=
            FUNDER_RETURN_LOOP_MAX_BLOCKS,
        )
        .map((outflow) => outflow.blockNumber)
        .sort((left, right) => left - right)[0];

      return returnBlock === undefined
        ? []
        : [{
            wallet: funding.wallet,
            fundingBlock: funding.fundingBlock,
            returnBlock,
            returnBlocks: returnBlock - funding.fundingBlock,
          }];
    });

    const uniqueMatches = [
      ...new Map(matches.map((match) => [match.wallet, match])).values(),
    ];

    if (uniqueMatches.length < FUNDER_RETURN_LOOP_MIN_WALLETS) {
      continue;
    }

    const ownMatch = uniqueMatches.find((match) => match.wallet === subject);
    const subjectIsHub = subject === hub;
    if (!ownMatch && !subjectIsHub) continue;

    const code = subjectIsHub
      ? 'HISTORICAL_FUNDER_RETURN_LOOP_HUB'
      : 'HISTORICAL_FUNDER_RETURN_LOOP';
    const score = Math.min(85, 60 + uniqueMatches.length * 4);

    signals.push({
      code,
      family: 'CLUSTER_LINK',
      strength: 'HIGH',
      score,
      independentKey: `funder-return:${hub}`,
    });

    await insertEvidenceRecord({
      invitation,
      subjectWallet: subject,
      family: 'CLUSTER_LINK',
      signalCode: code,
      strength: 'HIGH',
      score,
      relatedWallet: hub,
      evidence: {
        loopWalletCount: uniqueMatches.length,
        maxReturnBlocks: FUNDER_RETURN_LOOP_MAX_BLOCKS,
        observedMaxReturnBlocks: Math.max(
          ...uniqueMatches.map((match) => match.returnBlocks),
        ),
        ownFundingBlock: ownMatch?.fundingBlock ?? null,
        ownReturnBlock: ownMatch?.returnBlock ?? null,
        ownReturnBlocks: ownMatch?.returnBlocks ?? null,
        subjectIsHub,
      },
      dedupeKey:
        `sybil-v2:${invitation.invite_code}:${code.toLowerCase()}:${hub}`,
    });
  }

  return signals;
}

async function loadHistoricalSinkRecentRefunderSignals(
  invitation: InvitationV2Row,
  protocolDestinations: Set<string>,
): Promise<SybilV2Signal[]> {
  if (!invitation.activation_network || !invitation.invitee_wallet) return [];

  const network = invitation.activation_network;
  const subject = normalizeWallet(invitation.invitee_wallet);
  const protocol = protocolDestinations;
  const funding = await supabaseAdmin
    .from('sybil_v2_evidence_records')
    .select('related_wallet,observed_block')
    .eq('invite_code', invitation.invite_code)
    .eq('network', network)
    .eq('subject_wallet', subject)
    .eq('evidence_family', 'FUNDING')
    .in('signal_code', [
      'RECENT_PREACTIVATION_VET_FUNDER',
      'RECENT_PREACTIVATION_B3TR_FUNDER',
    ])
    .not('related_wallet', 'is', null)
    .not('observed_block', 'is', null);

  if (funding.error) {
    throw new Error(`Recent refunder evidence could not be loaded: ${funding.error.message}`);
  }

  const hubs = unique(
    (funding.data ?? [])
      .map((row) => normalizeWallet(String(row.related_wallet)))
      .filter((hub) => !protocol.has(hub)),
  );
  const signals: SybilV2Signal[] = [];

  for (const hub of hubs) {
    const peerFunding = await supabaseAdmin
      .from('sybil_v2_evidence_records')
      .select('subject_wallet,observed_block')
      .eq('network', network)
      .eq('evidence_family', 'FUNDING')
      .in('signal_code', [
        'RECENT_PREACTIVATION_VET_FUNDER',
        'RECENT_PREACTIVATION_B3TR_FUNDER',
      ])
      .eq('related_wallet', hub)
      .not('observed_block', 'is', null);

    if (peerFunding.error) {
      throw new Error(`Recent refunder peers could not be loaded: ${peerFunding.error.message}`);
    }

    const earliestFunding = new Map<string, number>();
    for (const row of peerFunding.data ?? []) {
      const wallet = normalizeWallet(String(row.subject_wallet));
      const block = Number(row.observed_block);
      if (!Number.isSafeInteger(block)) continue;
      const current = earliestFunding.get(wallet);
      if (current === undefined || block < current) earliestFunding.set(wallet, block);
    }

    const wallets = [...earliestFunding.keys()];
    if (wallets.length < 3) continue;

    const outflows = await supabaseAdmin
      .from('sybil_v2_preactivation_b3tr_outflows')
      .select('wallet_address,block_number')
      .eq('network', network)
      .eq('destination_wallet', hub)
      .in('wallet_address', wallets);

    if (outflows.error) {
      throw new Error(`Historical sink/refunder outflows could not be loaded: ${outflows.error.message}`);
    }

    const matched = new Set<string>();
    for (const row of outflows.data ?? []) {
      const wallet = normalizeWallet(String(row.wallet_address));
      const outBlock = Number(row.block_number);
      const fundingBlock = earliestFunding.get(wallet);
      if (
        fundingBlock !== undefined &&
        Number.isSafeInteger(outBlock) &&
        outBlock < fundingBlock
      ) {
        matched.add(wallet);
      }
    }

    if (matched.size < 3 || !matched.has(subject)) continue;

    const score = Math.min(90, 70 + matched.size * 4);
    const signal: SybilV2Signal = {
      code: 'HISTORICAL_SINK_RECENT_REFUNDER_CLUSTER',
      family: 'CLUSTER_LINK',
      strength: 'HIGH',
      score,
      independentKey: hub,
    };
    signals.push(signal);

    await insertEvidenceRecord({
      invitation,
      subjectWallet: subject,
      family: 'CLUSTER_LINK',
      signalCode: signal.code,
      strength: signal.strength,
      score: signal.score,
      relatedWallet: hub,
      evidence: {
        matchedWalletCount: matched.size,
        pattern: 'HISTORICAL_SINK_RECENT_REFUNDER_V1',
      },
      dedupeKey:
        `sybil-v2:${invitation.invite_code}:historical-sink-recent-refunder:${hub}`,
    });
  }

  return signals;
}

async function loadWatchFollowupSignals(
  invitation: InvitationV2Row,
): Promise<SybilV2Signal[]> {
  if (
    !invitation.activation_network ||
    !invitation.invitee_wallet
  ) {
    return [];
  }

  const subject =
    normalizeWallet(invitation.invitee_wallet);

  const { data, error } = await supabaseAdmin
    .from('sybil_v2_evidence_records')
    .select(
      'signal_code,strength,score,related_wallet',
    )
    .eq('invite_code', invitation.invite_code)
    .eq('network', invitation.activation_network)
    .eq('subject_wallet', subject)
    .eq('evidence_family', 'POST_PAYOUT')
    .in('signal_code', [
      'WATCH_SUBJECT_TO_INVITER',
      'WATCH_SUBJECT_TO_ACTIVE_BLACKLIST',
      'WATCH_SUBJECT_TO_CLUSTER_HUB',
    ]);

  if (error) {
    throw new Error(
      `WATCH follow-up evidence could not be loaded: ${error.message}`,
    );
  }

  const rows =
    (data ?? []) as WatchFollowupEvidenceRow[];

  const signals: SybilV2Signal[] = [];

  for (const row of rows) {
    const score = Number(row.score);
    if (
      !Number.isFinite(score) ||
      score <= 0
    ) {
      continue;
    }

    signals.push({
      code: row.signal_code,
      family: 'POST_PAYOUT',
      strength: row.strength,
      score,
      independentKey:
        row.related_wallet
          ? normalizeWallet(
              row.related_wallet,
            )
          : undefined,
    });
  }

  return signals;
}

async function loadMissionBehaviorSignals(
  invitation: InvitationV2Row,
): Promise<{
  signals: SybilV2Signal[];
  complete: boolean;
}> {
  if (!invitation.activation_network || !invitation.invitee_wallet) {
    return { signals: [], complete: false };
  }

  const result = await supabaseAdmin
    .from('operator_sybil_behavior_fingerprints')
    .select(
      'invite_code,inviter_wallet,invitee_wallet,activated_at,app_sequence,reward_intervals_seconds',
    )
    .eq('network', invitation.activation_network);

  if (result.error) {
    throw new Error(`Mission behavior fingerprints could not be loaded: ${result.error.message}`);
  }

  const rows = (result.data ?? []) as MissionFingerprintRow[];
  const own = rows.find((row) => row.invite_code === invitation.invite_code);
  if (!own || !Array.isArray(own.app_sequence) || own.app_sequence.length < 3) {
    return { signals: [], complete: false };
  }

  const ownActivated = Date.parse(own.activated_at);
  const similarPeers = rows.filter((peer) => {
    if (peer.invite_code === own.invite_code) return false;
    if (!Array.isArray(peer.app_sequence) || peer.app_sequence.length < 3) return false;
    const peerActivated = Date.parse(peer.activated_at);
    if (
      Number.isNaN(ownActivated) ||
      Number.isNaN(peerActivated) ||
      Math.abs(ownActivated - peerActivated) / 1000 > MISSION_PEER_WINDOW_SECONDS
    ) {
      return false;
    }
    return (
      appOverlap(own.app_sequence, peer.app_sequence) >= 2 / 3 &&
      intervalsSimilar(own.reward_intervals_seconds, peer.reward_intervals_seconds)
    );
  });

  const signals: SybilV2Signal[] = [];

  if (similarPeers.length >= 2) {
    const score = Math.min(40, 20 + similarPeers.length * 4);
    signals.push({
      code: 'MISSION_PATTERN_CLUSTER',
      family: 'MISSION_BEHAVIOR',
      strength: 'MEDIUM',
      score,
    });

    await insertEvidenceRecord({
      invitation,
      subjectWallet: invitation.invitee_wallet,
      family: 'MISSION_BEHAVIOR',
      signalCode: 'MISSION_PATTERN_CLUSTER',
      strength: 'MEDIUM',
      score,
      evidence: {
        similarPeerCount: similarPeers.length,
        appOverlapThreshold: 2 / 3,
        peerWindowSeconds: MISSION_PEER_WINDOW_SECONDS,
      },
      dedupeKey:
        `sybil-v2:${invitation.invite_code}:mission-pattern-cluster`,
    });
  }

  return { signals, complete: true };
}

async function loadAnalyticsExcludedWallets(
  wallets: string[],
): Promise<Set<string>> {
  const normalized = unique(
    wallets
      .filter(Boolean)
      .map((wallet) => normalizeWallet(wallet)),
  );
  if (normalized.length === 0) return new Set<string>();

  const { data, error } = await supabaseAdmin
    .from('analytics_excluded_wallets')
    .select('wallet_address')
    .eq('active', true)
    .in('wallet_address', normalized);

  if (error) {
    throw new Error(
      \`Sybil analytics-exclusion lookup failed: \${error.message}\`,
    );
  }

  return new Set(
    (data ?? [])
      .map((row) =>
        typeof row.wallet_address === 'string'
          ? normalizeWallet(row.wallet_address)
          : null,
      )
      .filter((wallet): wallet is string => Boolean(wallet)),
  );
}

function sequentialWalletSwitchGapSeconds({
  leftFirstSeenAt,
  leftLastSeenAt,
  rightFirstSeenAt,
  rightLastSeenAt,
}: {
  leftFirstSeenAt: string;
  leftLastSeenAt: string;
  rightFirstSeenAt: string;
  rightLastSeenAt: string;
}): number | null {
  const leftFirst = Date.parse(leftFirstSeenAt);
  const leftLast = Date.parse(leftLastSeenAt);
  const rightFirst = Date.parse(rightFirstSeenAt);
  const rightLast = Date.parse(rightLastSeenAt);

  if (
    [leftFirst, leftLast, rightFirst, rightLast]
      .some((value) => Number.isNaN(value))
  ) {
    return null;
  }

  if (rightFirst >= leftLast) {
    return (rightFirst - leftLast) / 1000;
  }
  if (leftFirst >= rightLast) {
    return (leftFirst - rightLast) / 1000;
  }

  // Overlapping observations on one pseudonymous client are at least as
  // suspicious as an immediate sequential switch.
  return 0;
}

async function loadSecurityIdentitySignals(
  invitation: InvitationV2Row,
): Promise<{
  signals: SybilV2Signal[];
  complete: boolean;
}> {
  if (invitation.invitee_wallet) {
    const inviteeWallet = normalizeWallet(invitation.invitee_wallet);
    const inviterWallet = normalizeWallet(invitation.inviter_wallet);
    const inviteeClients = await supabaseAdmin
      .from('security_client_wallet_observations')
      .select('client_id,first_seen_at,last_seen_at')
      .eq('wallet_address', inviteeWallet);

    if (inviteeClients.error) {
      throw new Error(\`Security client evidence could not be loaded: \${inviteeClients.error.message}\`);
    }

    const clientIds = unique(
      (inviteeClients.data ?? []).map((row) => String(row.client_id)),
    );

    if (clientIds.length > 0) {
      const [inviterClient, relatedClientRowsResult] = await Promise.all([
        supabaseAdmin
          .from('security_client_wallet_observations')
          .select('client_id,first_seen_at,last_seen_at')
          .eq('wallet_address', inviterWallet)
          .in('client_id', clientIds),
        supabaseAdmin
          .from('security_client_wallet_observations')
          .select('client_id,wallet_address,first_seen_at,last_seen_at')
          .in('client_id', clientIds)
          .neq('wallet_address', inviteeWallet),
      ]);

      if (inviterClient.error) {
        throw new Error(\`Inviter security client evidence could not be loaded: \${inviterClient.error.message}\`);
      }
      if (relatedClientRowsResult.error) {
        throw new Error(\`Related security client evidence could not be loaded: \${relatedClientRowsResult.error.message}\`);
      }

      const inviterRows = inviterClient.data ?? [];
      const inviteeRows = inviteeClients.data ?? [];
      const activationAt = invitation.activated_at
        ? Date.parse(invitation.activated_at)
        : Number.NaN;

      for (const inviterRow of inviterRows) {
        const sharedClientId = String(inviterRow.client_id);
        const inviteeRow = inviteeRows.find(
          (row) => String(row.client_id) === sharedClientId,
        );
        if (!inviteeRow) continue;

        const inviterLastSeen = Date.parse(String(inviterRow.last_seen_at));
        const inviteeFirstSeen = Date.parse(String(inviteeRow.first_seen_at));
        const switchGapSeconds =
          Number.isNaN(inviterLastSeen) || Number.isNaN(inviteeFirstSeen)
            ? null
            : (inviteeFirstSeen - inviterLastSeen) / 1000;
        const activationGapSeconds =
          Number.isNaN(activationAt) || Number.isNaN(inviteeFirstSeen)
            ? null
            : Math.abs(activationAt - inviteeFirstSeen) / 1000;
        const immediateSwitch =
          switchGapSeconds !== null &&
          activationGapSeconds !== null &&
          switchGapSeconds >= 0 &&
          switchGapSeconds <= 10 * 60 &&
          activationGapSeconds <= 10 * 60;

        const signals: SybilV2Signal[] = [{
          code: 'SECURITY_CLIENT_INVITER_LINK',
          family: 'SECURITY_IDENTITY',
          strength: 'HIGH',
          score: 95,
          independentKey: sharedClientId,
        }];

        if (immediateSwitch) {
          signals.push({
            code: 'SECURITY_CLIENT_INVITER_IMMEDIATE_SWITCH',
            family: 'SECURITY_IDENTITY',
            strength: 'HIGH',
            score: 100,
            independentKey: sharedClientId,
          });
        }

        for (const signal of signals) {
          await insertEvidenceRecord({
            invitation,
            subjectWallet: inviteeWallet,
            family: 'SECURITY_IDENTITY',
            signalCode: signal.code,
            strength: signal.strength,
            score: signal.score,
            relatedWallet: inviterWallet,
            evidence: {
              sameInviterClient: true,
              sharedClientId,
              preVoteDetection: true,
              immediateSwitch,
              switchGapSeconds,
              activationGapSeconds,
            },
            dedupeKey:
              \`sybil-v2:\${invitation.invite_code}:\${signal.code.toLowerCase()}:\${sharedClientId}\`,
          });
        }

        return { signals, complete: true };
      }

      const relatedClientRows = (relatedClientRowsResult.data ?? []) as Array<{
        client_id: string;
        wallet_address: string;
        first_seen_at: string;
        last_seen_at: string;
      }>;
      const relatedWallets = unique(
        relatedClientRows
          .map((row) => normalizeWallet(row.wallet_address))
          .filter((wallet) => wallet !== inviterWallet),
      );
      const excludedWallets = await loadAnalyticsExcludedWallets([
        inviteeWallet,
        inviterWallet,
        ...relatedWallets,
      ]);

      if (
        !excludedWallets.has(inviteeWallet) &&
        !excludedWallets.has(inviterWallet) &&
        relatedWallets.length > 0
      ) {
        const siblingInvitationsResult = await supabaseAdmin
          .from('invitations')
          .select(
            'invite_code,inviter_wallet,invitee_wallet,activated_at,status,sybil_status,eligibility_check_id,ineligibility_check_id',
          )
          .eq('inviter_wallet', inviterWallet)
          .in('invitee_wallet', relatedWallets);

        if (siblingInvitationsResult.error) {
          throw new Error(
            \`Sibling security-client invitations could not be loaded: \${siblingInvitationsResult.error.message}\`,
          );
        }

        const siblingInvitations = (siblingInvitationsResult.data ?? [])
          .filter((row) =>
            typeof row.invitee_wallet === 'string' &&
            row.eligibility_check_id !== null &&
            row.ineligibility_check_id === null &&
            ['ACTIVATING', 'UNDER_REVIEW', 'COMPLETED'].includes(String(row.status)) &&
            row.sybil_status !== 'BLOCKED' &&
            !excludedWallets.has(normalizeWallet(row.invitee_wallet)),
          );

        for (const sibling of siblingInvitations) {
          const siblingWallet = normalizeWallet(String(sibling.invitee_wallet));
          const siblingRows = relatedClientRows.filter(
            (row) => normalizeWallet(row.wallet_address) === siblingWallet,
          );

          for (const siblingRow of siblingRows) {
            const sharedClientId = String(siblingRow.client_id);
            const ownRow = inviteeRows.find(
              (row) => String(row.client_id) === sharedClientId,
            );
            if (!ownRow) continue;

            const switchGapSeconds = sequentialWalletSwitchGapSeconds({
              leftFirstSeenAt: String(ownRow.first_seen_at),
              leftLastSeenAt: String(ownRow.last_seen_at),
              rightFirstSeenAt: siblingRow.first_seen_at,
              rightLastSeenAt: siblingRow.last_seen_at,
            });
            const ownFirstSeen = Date.parse(String(ownRow.first_seen_at));
            const siblingFirstSeen = Date.parse(siblingRow.first_seen_at);
            const siblingActivatedAt =
              typeof sibling.activated_at === 'string'
                ? Date.parse(sibling.activated_at)
                : Number.NaN;
            const activationGapSeconds =
              Number.isNaN(activationAt) || Number.isNaN(ownFirstSeen)
                ? null
                : Math.abs(activationAt - ownFirstSeen) / 1000;
            const siblingActivationGapSeconds =
              Number.isNaN(siblingActivatedAt) ||
              Number.isNaN(siblingFirstSeen)
                ? null
                : Math.abs(siblingActivatedAt - siblingFirstSeen) / 1000;
            const immediateSwitch =
              switchGapSeconds !== null &&
              activationGapSeconds !== null &&
              siblingActivationGapSeconds !== null &&
              switchGapSeconds <= 10 * 60 &&
              activationGapSeconds <= 10 * 60 &&
              siblingActivationGapSeconds <= 10 * 60;

            const signals: SybilV2Signal[] = [{
              code: 'SECURITY_CLIENT_SIBLING_LINK',
              family: 'SECURITY_IDENTITY',
              strength: 'MEDIUM',
              score: 60,
              independentKey: sharedClientId,
            }];

            if (immediateSwitch) {
              signals.push({
                code: 'SECURITY_CLIENT_SIBLING_IMMEDIATE_SWITCH',
                family: 'SECURITY_IDENTITY',
                strength: 'HIGH',
                score: 100,
                independentKey: sharedClientId,
              });
            }

            for (const signal of signals) {
              await insertEvidenceRecord({
                invitation,
                subjectWallet: inviteeWallet,
                family: 'SECURITY_IDENTITY',
                signalCode: signal.code,
                strength: signal.strength,
                score: signal.score,
                relatedWallet: siblingWallet,
                evidence: {
                  sameInviterSibling: true,
                  inviterWallet,
                  peerInviteCode: sibling.invite_code,
                  peerWallet: siblingWallet,
                  sharedClientId,
                  preVoteDetection: true,
                  immediateSwitch,
                  switchGapSeconds,
                  activationGapSeconds,
                  peerActivationGapSeconds: siblingActivationGapSeconds,
                },
                dedupeKey:
                  \`sybil-v2:\${invitation.invite_code}:\${signal.code.toLowerCase()}:\${sharedClientId}:\${sibling.invite_code}\`,
              });
            }

            return { signals, complete: true };
          }
        }
      }
    }

    // A suspicious inviter may itself be a recent VeInvite invitee. If two of
    // its downstream invitees immediately switch wallets on one security
    // client, surface that as a separate cluster-link domain. This does not
    // blacklist the inviter by association; it only corroborates other
    // independent evidence such as funding or historical behavior.
    const downstreamInvitationsResult = await supabaseAdmin
      .from('invitations')
      .select(
        'invite_code,invitee_wallet,activated_at,status,sybil_status,eligibility_check_id,ineligibility_check_id',
      )
      .eq('inviter_wallet', inviteeWallet);

    if (downstreamInvitationsResult.error) {
      throw new Error(
        \`Downstream security-client invitations could not be loaded: \${downstreamInvitationsResult.error.message}\`,
      );
    }

    const downstreamInvitations = (downstreamInvitationsResult.data ?? [])
      .filter((row) =>
        typeof row.invitee_wallet === 'string' &&
        row.eligibility_check_id !== null &&
        row.ineligibility_check_id === null &&
        ['ACTIVATING', 'UNDER_REVIEW', 'COMPLETED'].includes(String(row.status)) &&
        row.sybil_status !== 'BLOCKED',
      );

    if (downstreamInvitations.length >= 2) {
      const downstreamWallets = unique(
        downstreamInvitations.map((row) =>
          normalizeWallet(String(row.invitee_wallet)),
        ),
      );
      const excludedDownstreamWallets =
        await loadAnalyticsExcludedWallets([
          inviteeWallet,
          ...downstreamWallets,
        ]);

      if (!excludedDownstreamWallets.has(inviteeWallet)) {
        const downstreamObservationsResult = await supabaseAdmin
          .from('security_client_wallet_observations')
          .select('client_id,wallet_address,first_seen_at,last_seen_at')
          .in(
            'wallet_address',
            downstreamWallets.filter(
              (wallet) => !excludedDownstreamWallets.has(wallet),
            ),
          );

        if (downstreamObservationsResult.error) {
          throw new Error(
            \`Downstream security-client observations could not be loaded: \${downstreamObservationsResult.error.message}\`,
          );
        }

        const downstreamObservations =
          (downstreamObservationsResult.data ?? []) as Array<{
            client_id: string;
            wallet_address: string;
            first_seen_at: string;
            last_seen_at: string;
          }>;

        for (let leftIndex = 0; leftIndex < downstreamInvitations.length; leftIndex += 1) {
          const left = downstreamInvitations[leftIndex];
          if (!left.invitee_wallet) continue;
          const leftWallet = normalizeWallet(left.invitee_wallet);
          if (excludedDownstreamWallets.has(leftWallet)) continue;

          for (
            let rightIndex = leftIndex + 1;
            rightIndex < downstreamInvitations.length;
            rightIndex += 1
          ) {
            const right = downstreamInvitations[rightIndex];
            if (!right.invitee_wallet) continue;
            const rightWallet = normalizeWallet(right.invitee_wallet);
            if (excludedDownstreamWallets.has(rightWallet)) continue;

            const leftRows = downstreamObservations.filter(
              (row) => normalizeWallet(row.wallet_address) === leftWallet,
            );
            const rightRows = downstreamObservations.filter(
              (row) => normalizeWallet(row.wallet_address) === rightWallet,
            );

            for (const leftRow of leftRows) {
              const rightRow = rightRows.find(
                (row) => String(row.client_id) === String(leftRow.client_id),
              );
              if (!rightRow) continue;

              const switchGapSeconds = sequentialWalletSwitchGapSeconds({
                leftFirstSeenAt: leftRow.first_seen_at,
                leftLastSeenAt: leftRow.last_seen_at,
                rightFirstSeenAt: rightRow.first_seen_at,
                rightLastSeenAt: rightRow.last_seen_at,
              });
              const leftActivated = left.activated_at
                ? Date.parse(String(left.activated_at))
                : Number.NaN;
              const rightActivated = right.activated_at
                ? Date.parse(String(right.activated_at))
                : Number.NaN;
              const leftFirstSeen = Date.parse(leftRow.first_seen_at);
              const rightFirstSeen = Date.parse(rightRow.first_seen_at);
              const leftActivationGap =
                Number.isNaN(leftActivated) || Number.isNaN(leftFirstSeen)
                  ? null
                  : Math.abs(leftActivated - leftFirstSeen) / 1000;
              const rightActivationGap =
                Number.isNaN(rightActivated) || Number.isNaN(rightFirstSeen)
                  ? null
                  : Math.abs(rightActivated - rightFirstSeen) / 1000;

              const immediateSwitch =
                switchGapSeconds !== null &&
                leftActivationGap !== null &&
                rightActivationGap !== null &&
                switchGapSeconds <= 10 * 60 &&
                leftActivationGap <= 10 * 60 &&
                rightActivationGap <= 10 * 60;

              if (!immediateSwitch) continue;

              const signal: SybilV2Signal = {
                code: 'SECURITY_CLIENT_DOWNSTREAM_SIBLING_SWITCH',
                family: 'CLUSTER_LINK',
                strength: 'MEDIUM',
                score: 60,
                independentKey: String(leftRow.client_id),
              };

              await insertEvidenceRecord({
                invitation,
                subjectWallet: inviteeWallet,
                family: 'CLUSTER_LINK',
                signalCode: signal.code,
                strength: signal.strength,
                score: signal.score,
                relatedWallet: rightWallet,
                evidence: {
                  inviterWallet: inviteeWallet,
                  downstreamInviteCodes: [
                    left.invite_code,
                    right.invite_code,
                  ],
                  downstreamWallets: [leftWallet, rightWallet],
                  sharedClientId: String(leftRow.client_id),
                  immediateSwitch: true,
                  switchGapSeconds,
                  leftActivationGapSeconds: leftActivationGap,
                  rightActivationGapSeconds: rightActivationGap,
                },
                dedupeKey:
                  \`sybil-v2:\${invitation.invite_code}:security-client-downstream-sibling-switch:\${String(leftRow.client_id)}:\${left.invite_code}:\${right.invite_code}\`,
              });

              return { signals: [signal], complete: false };
            }
          }
        }
      }
    }
  }

  const checkedAt = invitation.identity_link_checked_at
    ? Date.parse(invitation.identity_link_checked_at)
    : Number.NaN;
  const voteAt = invitation.vote_completed_at
    ? Date.parse(invitation.vote_completed_at)
    : Number.NaN;

  const supported = [
    'NO_KNOWN_LINK',
    'REVIEW',
    'LINKED_EXISTING',
    'OPERATOR_CLEARED',
  ].includes(invitation.identity_link_status);

  const complete =
    supported &&
    !Number.isNaN(checkedAt) &&
    !Number.isNaN(voteAt) &&
    checkedAt >= voteAt;

  if (!complete) {
    return { signals: [], complete: false };
  }

  const evidence = invitation.identity_link_evidence ?? {};
  const sameInviterClient = evidence.sameInviterClient === true;
  const relatedRewarded =
    evidence.relatedCompletedOrRewardedParticipant === true;

  const signals: SybilV2Signal[] = [];

  if (
    invitation.identity_link_status === 'REVIEW' ||
    invitation.identity_link_status === 'LINKED_EXISTING'
  ) {
    const score = sameInviterClient ? 90 : relatedRewarded ? 80 : 60;
    const strength =
      sameInviterClient || relatedRewarded
        ? 'HIGH'
        : 'MEDIUM';
    const signalCode = sameInviterClient
      ? 'SECURITY_CLIENT_INVITER_LINK'
      : 'SECURITY_CLIENT_PARTICIPANT_LINK';

    signals.push({
      code: signalCode,
      family: 'SECURITY_IDENTITY',
      strength,
      score,
    });

    await insertEvidenceRecord({
      invitation,
      subjectWallet: invitation.invitee_wallet!,
      family: 'SECURITY_IDENTITY',
      signalCode,
      strength,
      score,
      relatedWallet: sameInviterClient ? invitation.inviter_wallet : null,
      evidence,
      dedupeKey:
        \`sybil-v2:\${invitation.invite_code}:security-identity-link\`,
    });
  }

  return { signals, complete: true };
}

async function hasActiveRestriction(
  invitation: InvitationV2Row,
): Promise<boolean> {
  if (!invitation.activation_network || !invitation.invitee_wallet) return false;

  // Referral-level Sybil assessment is scoped to the invitee subject.
  // An inviter restriction is intentionally INVITER_ONLY and is enforced
  // against that inviter's own VeInvite participation, not inherited by
  // otherwise independent invitees.
  const subjectWallet =
    normalizeWallet(invitation.invitee_wallet);

  const { data, error } = await supabaseAdmin
    .from('sybil_v2_wallet_restrictions')
    .select('id')
    .eq('network', invitation.activation_network)
    .eq('status', 'ACTIVE')
    .eq('wallet_address', subjectWallet)
    .limit(1);

  if (error) {
    throw new Error(`Sybil v2 wallet restrictions could not be loaded: ${error.message}`);
  }

  return (data ?? []).length > 0;
}

async function findConfirmedClusterHubMatch(
  invitation: InvitationV2Row,
  signals: SybilV2Signal[],
): Promise<ConfirmedClusterHubRow | null> {
  if (
    !invitation.activation_network ||
    !invitation.invitee_wallet
  ) {
    return null;
  }

  const subjectWallet =
    normalizeWallet(invitation.invitee_wallet);
  const evidenceResult = await supabaseAdmin
    .from('sybil_v2_evidence_records')
    .select('signal_code,strength,score,related_wallet')
    .eq('invite_code', invitation.invite_code)
    .eq('network', invitation.activation_network)
    .eq('subject_wallet', subjectWallet)
    .in('signal_code', [
      ...CONFIRMED_CLUSTER_LINK_CODES,
      'HISTORICAL_DENSE_B3TR_BURST',
    ]);

  if (evidenceResult.error) {
    throw new Error(
      `Confirmed cluster evidence could not be loaded: ${evidenceResult.error.message}`,
    );
  }

  const codesByHub = new Map<string, Set<string>>();

  for (
    const row of
      (evidenceResult.data ?? []) as ConfirmedClusterEvidenceRow[]
  ) {
    if (
      row.strength !== 'HIGH' ||
      Number(row.score) <= 0 ||
      !row.related_wallet
    ) {
      continue;
    }

    const hub = normalizeWallet(row.related_wallet);
    const codes = codesByHub.get(hub) ?? new Set<string>();
    codes.add(row.signal_code);
    codesByHub.set(hub, codes);
  }

  const hasSynchronizedReward = hasHighSignal(
    signals,
    'HISTORICAL_SYNCHRONIZED_REWARD_CLUSTER',
  );
  const hasMissionPattern = signals.some(
    (signal) =>
      signal.code === 'MISSION_PATTERN_CLUSTER' &&
      ['MEDIUM', 'HIGH'].includes(signal.strength) &&
      signal.score > 0,
  );

  const candidateHubs = [...codesByHub.entries()]
    .filter(([, codes]) =>
      CONFIRMED_CLUSTER_LINK_CODES.every((code) =>
        codes.has(code),
      ) &&
      (
        hasSynchronizedReward ||
        hasMissionPattern ||
        codes.has('HISTORICAL_DENSE_B3TR_BURST')
      ),
    )
    .map(([hub]) => hub);

  if (candidateHubs.length === 0) {
    return null;
  }

  const confirmedResult = await supabaseAdmin
    .from('sybil_v2_confirmed_cluster_hubs')
    .select('wallet_address,confirmed_at')
    .eq('network', invitation.activation_network)
    .eq('status', 'ACTIVE')
    .eq(
      'signature_code',
      CONFIRMED_CLUSTER_SIGNATURE_CODE,
    )
    .in('wallet_address', candidateHubs);

  if (confirmedResult.error) {
    throw new Error(
      `Confirmed cluster hubs could not be loaded: ${confirmedResult.error.message}`,
    );
  }

  const matches = (
    confirmedResult.data ?? []
  ) as ConfirmedClusterHubRow[];

  // Confirmation time is knowledge time, not offense time. For any unpaid
  // referral, newly confirmed historical cluster evidence may be applied
  // retroactively. Hub linkage alone is never enough: the subject must also
  // reproduce the common-sink/inviter relationship and have synchronized
  // rewards, a dense B3TR burst, or an independent mission-pattern cluster.
  // Paid/assigned rewards remain protected by the enforcement RPC and
  // post-payout review path.
  return (
    matches
      .filter((row) => !Number.isNaN(Date.parse(row.confirmed_at)))
      .sort(
        (left, right) =>
          Date.parse(left.confirmed_at) -
          Date.parse(right.confirmed_at),
      )[0] ?? null
  );
}

async function applyConfirmedClusterBlacklist({
  invitation,
  expectedRevision,
  hubWallet,
}: {
  invitation: InvitationV2Row;
  expectedRevision: number;
  hubWallet: string;
}): Promise<ConfirmedClusterBlacklistRpcResult> {
  if (!invitation.activation_network) {
    return {
      changed: false,
      reason: 'NETWORK_MISSING',
    };
  }

  const { data, error } = await supabaseAdmin.rpc(
    'apply_sybil_v2_confirmed_cluster_blacklist',
    {
      p_invite_code: invitation.invite_code,
      p_expected_revision: expectedRevision,
      p_hub_wallet: normalizeWallet(hubWallet),
      p_signature_code:
        CONFIRMED_CLUSTER_SIGNATURE_CODE,
      p_network: invitation.activation_network,
    },
  );

  if (error) {
    throw new Error(
      `Confirmed cluster blacklist could not be applied: ${error.message}`,
    );
  }

  return (data ?? {}) as ConfirmedClusterBlacklistRpcResult;
}

async function findBehaviorPatternHub(
  invitation: InvitationV2Row,
): Promise<string | null> {
  if (!invitation.activation_network || !invitation.invitee_wallet) {
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from('sybil_v2_evidence_records')
    .select('related_wallet,strength,score')
    .eq('invite_code', invitation.invite_code)
    .eq('network', invitation.activation_network)
    .eq('subject_wallet', normalizeWallet(invitation.invitee_wallet))
    .eq('signal_code', 'HISTORICAL_DENSE_B3TR_BURST')
    .eq('strength', 'HIGH')
    .gt('score', 0);

  if (error) {
    throw new Error(
      `Behavior-pattern burst evidence could not be loaded: ${error.message}`,
    );
  }

  const rows = (data ?? []) as Array<{
    related_wallet: string | null;
    strength: string;
    score: number | string;
  }>;

  const eligible = rows
    .filter((row) => row.related_wallet)
    .sort((left, right) => Number(right.score) - Number(left.score));

  return eligible[0]?.related_wallet
    ? normalizeWallet(eligible[0].related_wallet)
    : null;
}

async function findFunderReturnLoopHub(
  invitation: InvitationV2Row,
): Promise<string | null> {
  if (!invitation.activation_network || !invitation.invitee_wallet) {
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from('sybil_v2_evidence_records')
    .select('related_wallet,strength,score')
    .eq('invite_code', invitation.invite_code)
    .eq('network', invitation.activation_network)
    .eq('subject_wallet', normalizeWallet(invitation.invitee_wallet))
    .in('signal_code', [
      'HISTORICAL_FUNDER_RETURN_LOOP',
      'HISTORICAL_FUNDER_RETURN_LOOP_HUB',
      'HISTORICAL_SINK_RECENT_REFUNDER_CLUSTER',
    ])
    .eq('strength', 'HIGH')
    .gt('score', 0);

  if (error) {
    throw new Error(
      `Funder-return loop evidence could not be loaded: ${error.message}`,
    );
  }

  const rows = (data ?? []) as Array<{
    related_wallet: string | null;
    score: number | string;
  }>;

  const eligible = rows
    .filter((row) => row.related_wallet)
    .sort((left, right) => Number(right.score) - Number(left.score));

  return eligible[0]?.related_wallet
    ? normalizeWallet(eligible[0].related_wallet)
    : null;
}

async function applySecurityClientInviterRestriction({
  invitation,
  expectedRevision,
}: {
  invitation: InvitationV2Row;
  expectedRevision: number;
}): Promise<BehaviorPatternRestrictionRpcResult> {
  if (!invitation.activation_network) {
    return { changed: false, reason: 'NETWORK_MISSING' };
  }
  const { data, error } = await supabaseAdmin.rpc(
    'apply_sybil_v2_security_client_inviter_restriction',
    {
      p_invite_code: invitation.invite_code,
      p_expected_revision: expectedRevision,
      p_network: invitation.activation_network,
    },
  );
  if (error) {
    throw new Error(`Security-client restriction could not be applied: ${error.message}`);
  }
  return (data ?? {}) as BehaviorPatternRestrictionRpcResult;
}

async function applyFunderReturnLoopRestriction({
  invitation,
  expectedRevision,
  hubWallet,
}: {
  invitation: InvitationV2Row;
  expectedRevision: number;
  hubWallet: string;
}): Promise<BehaviorPatternRestrictionRpcResult> {
  if (!invitation.activation_network) {
    return {
      changed: false,
      reason: 'NETWORK_MISSING',
    };
  }

  const { data, error } = await supabaseAdmin.rpc(
    'apply_sybil_v2_funder_return_loop_restriction',
    {
      p_invite_code: invitation.invite_code,
      p_expected_revision: expectedRevision,
      p_hub_wallet: normalizeWallet(hubWallet),
      p_network: invitation.activation_network,
    },
  );

  if (error) {
    throw new Error(
      `Funder-return loop restriction could not be applied: ${error.message}`,
    );
  }

  return (data ?? {}) as BehaviorPatternRestrictionRpcResult;
}

async function applyBehaviorPatternRestriction({
  invitation,
  expectedRevision,
  hubWallet,
}: {
  invitation: InvitationV2Row;
  expectedRevision: number;
  hubWallet: string;
}): Promise<BehaviorPatternRestrictionRpcResult> {
  if (!invitation.activation_network) {
    return {
      changed: false,
      reason: 'NETWORK_MISSING',
    };
  }

  const { data, error } = await supabaseAdmin.rpc(
    'apply_sybil_v2_behavior_pattern_restriction',
    {
      p_invite_code: invitation.invite_code,
      p_expected_revision: expectedRevision,
      p_hub_wallet: normalizeWallet(hubWallet),
      p_network: invitation.activation_network,
    },
  );

  if (error) {
    throw new Error(
      `Behavior-pattern restriction could not be applied: ${error.message}`,
    );
  }

  return (data ?? {}) as BehaviorPatternRestrictionRpcResult;
}

async function loadFinalizedBlock(): Promise<number> {
  const { nodeUrl } = getVeBetterNetworkConfig();
  const thor = ThorClient.at(nodeUrl);
  const block = await thor.blocks.getBlockCompressed('finalized');
  const number = Number(block?.number);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error('Sybil v2 could not load a finalized VeChain block.');
  }
  return number;
}

async function loadAssessment(inviteCode: string): Promise<AssessmentRow | null> {
  const { data, error } = await supabaseAdmin
    .from('sybil_v2_referral_assessments')
    .select('invite_code,state,revision,source,policy_version,updated_at,evidence_summary')
    .eq('invite_code', inviteCode)
    .maybeSingle();

  if (error) {
    throw new Error(`Sybil v2 assessment could not be loaded: ${error.message}`);
  }

  return data as AssessmentRow | null;
}

async function hasNewEvidenceForCurrentAssessment(
  inviteCode: string,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('operator_sybil_v2_assessment_candidates')
    .select('invite_code')
    .eq('invite_code', inviteCode)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Sybil v2 reassessment freshness could not be loaded: ${error.message}`,
    );
  }

  return Boolean(data);
}

async function recordAssessment({
  invitation,
  state,
  riskScore,
  evidenceCutoffBlock,
  completedChecks,
  reasonCodes,
  evidenceSummary,
  expectedRevision,
}: {
  invitation: InvitationV2Row;
  state: SybilV2AssessmentResult['state'];
  riskScore: number;
  evidenceCutoffBlock: number | null;
  completedChecks: string[];
  reasonCodes: string[];
  evidenceSummary: Record<string, unknown>;
  expectedRevision: number;
}): Promise<AssessmentRpcResult> {
  const { data, error } = await supabaseAdmin.rpc(
    'record_sybil_v2_assessment',
    {
      p_invite_code: invitation.invite_code,
      p_network: invitation.activation_network,
      p_state: state,
      p_risk_score: riskScore,
      p_policy_version: SYBIL_V2_POLICY_VERSION,
      p_analyzer_version: SYBIL_V2_ANALYZER_VERSION,
      p_evidence_cutoff_block: evidenceCutoffBlock,
      p_required_checks: [...REQUIRED_CHECKS],
      p_completed_checks: completedChecks,
      p_reason_codes: reasonCodes,
      p_evidence_summary: evidenceSummary,
      p_source: 'SYSTEM',
      p_expected_revision: expectedRevision,
    },
  );

  if (error) {
    throw new Error(`Sybil v2 assessment could not be recorded: ${error.message}`);
  }

  return (data ?? {}) as AssessmentRpcResult;
}

async function issueClearance(
  inviteCode: string,
  revision: number,
): Promise<ClearanceRpcResult> {
  const { data, error } = await supabaseAdmin.rpc(
    'issue_sybil_v2_reward_clearance',
    {
      p_invite_code: inviteCode,
      p_expected_revision: revision,
    },
  );

  if (error) {
    throw new Error(`Sybil v2 clearance could not be issued: ${error.message}`);
  }

  return (data ?? {}) as ClearanceRpcResult;
}

export async function assessSybilV2Referral(
  inviteCode: string,
): Promise<SybilV2AssessmentResult> {
  const normalizedCode = inviteCode.trim().toUpperCase();
  const invitation = await loadInvitation(normalizedCode);

  if (
    !invitation ||
    !invitation.invitee_wallet ||
    !invitation.activation_network
  ) {
    throw new Error('Sybil v2 assessment requires an activated invitation.');
  }

  const currentAssessment = await loadAssessment(normalizedCode);

  // Never let a background worker overwrite an operator HOLD/restriction.
  if (
    currentAssessment?.source === 'OPERATOR' &&
    ['HOLD', 'RESTRICTED'].includes(currentAssessment.state)
  ) {
    return {
      inviteCode: normalizedCode,
      state: currentAssessment.state as 'HOLD' | 'RESTRICTED',
      riskScore: currentAssessment.state === 'RESTRICTED' ? 100 : 60,
      reasonCodes: ['OPERATOR_DECISION_ACTIVE'],
      revision: safeRevision(currentAssessment.revision),
      clearanceIssued: false,
      clearanceId: null,
    };
  }

  if (
    currentAssessment?.source === 'OPERATOR' &&
    currentAssessment.state === 'CLEAR'
  ) {
    const revision = safeRevision(currentAssessment.revision);
    if (revision === null) {
      throw new Error('Operator-cleared Sybil v2 assessment has an invalid revision.');
    }

    const hasNewEvidence =
      await hasNewEvidenceForCurrentAssessment(normalizedCode);

    // The operator cleared the exact evidence set represented by this revision.
    // Keep that decision stable until genuinely newer evidence arrives.
    if (!hasNewEvidence) {
      const clearance = await issueClearance(normalizedCode, revision);
      return {
        inviteCode: normalizedCode,
        state: 'CLEAR',
        riskScore: 0,
        reasonCodes: ['OPERATOR_CLEARED'],
        revision,
        clearanceIssued: clearance.issued === true,
        clearanceId:
          typeof clearance.clearanceId === 'string'
            ? clearance.clearanceId
            : null,
      };
    }
  }

  const checkpoint = await loadCheckpoint(normalizedCode);
  const checkpointCurrent =
    checkpoint?.analyzer_version === SYBIL_V2_ANALYZER_VERSION;
  const completedChecks: string[] = [];
  const analysisFailed =
    checkpointCurrent &&
    (
      checkpoint?.historical_chain_status === 'FAILED' ||
      checkpoint?.funding_chain_status === 'FAILED'
    );

  // A COMPLETE checkpoint is only authoritative for the analyzer version
  // that produced it. New detector logic must force ANALYSIS_PENDING until
  // historical/funding evidence is recollected under the current analyzer.
  if (
    checkpointCurrent &&
    checkpoint?.historical_chain_status === 'COMPLETE'
  ) {
    completedChecks.push('HISTORICAL_CHAIN');
  }
  if (
    checkpointCurrent &&
    checkpoint?.funding_chain_status === 'COMPLETE'
  ) {
    completedChecks.push('FUNDING_CHAIN');
  }

  const signals: SybilV2Signal[] = [];
  const protocolDestinations = invitation.activation_network
    ? await loadKnownProtocolDestinations(invitation.activation_network)
    : knownProtocolDestinations();

  if (
    checkpointCurrent &&
    checkpoint?.historical_chain_status === 'COMPLETE'
  ) {
    signals.push(...await loadHistoricalRewardSignals(invitation));
    signals.push(...await loadConsolidationSignals(
      invitation,
      protocolDestinations,
    ));
  }

  if (
    checkpointCurrent &&
    checkpoint?.funding_chain_status === 'COMPLETE'
  ) {
    signals.push(...await loadFundingSignals(
      invitation,
      protocolDestinations,
    ));
    signals.push(...await loadHistoricalFunderReturnLoopSignals(
      invitation,
      protocolDestinations,
    ));
    signals.push(...await loadHistoricalSinkRecentRefunderSignals(
      invitation,
      protocolDestinations,
    ));
  }

  const mission = await loadMissionBehaviorSignals(invitation);
  signals.push(...mission.signals);
  if (mission.complete) completedChecks.push('MISSION_BEHAVIOR');

  const security = await loadSecurityIdentitySignals(invitation);
  signals.push(...security.signals);
  if (security.complete) completedChecks.push('SECURITY_IDENTITY');

  // WATCH follow-up evidence is reintroduced into the normal policy.
  // Direct post-payout links use the POST_PAYOUT domain, while a concentration
  // hub link is deliberately collapsed back into HISTORICAL_ACTIVITY so the
  // same consolidation relationship cannot be counted twice.
  signals.push(
    ...await loadWatchFollowupSignals(
      invitation,
    ),
  );

  let finalizedBlock: number | null = null;
  try {
    finalizedBlock = await loadFinalizedBlock();
    const voteBlock = safeNonNegativeBlock(invitation.vote_completed_block);
    if (
      voteBlock !== null &&
      finalizedBlock >= voteBlock
    ) {
      completedChecks.push('CHAIN_FINALITY');
    }
  } catch {
    finalizedBlock = null;
  }

  const activeRestriction = await hasActiveRestriction(invitation);
  const decisionChecksComplete = DECISION_CHECKS.every((check) =>
    completedChecks.includes(check),
  );

  // Finality protects reward clearance/reservation, not the abuse verdict itself.
  // This lets CLEAR/HOLD be decided on the next assessment pass while the
  // existing DB clearance gate still requires CHAIN_FINALITY before any reward
  // can be reserved or claimed. WATCH is legacy-only as of Sybil v2.10.
  const policy = evaluateSybilV2Policy({
    signals,
    requiredChecksComplete: decisionChecksComplete,
    analysisFailed,
    activeRestriction,
  });

  const confirmedClusterHub =
    policy.state === 'HOLD'
      ? await findConfirmedClusterHubMatch(
          invitation,
          signals,
        )
      : null;
  const behaviorPatternHub =
    policy.state === 'HOLD'
      ? await findBehaviorPatternHub(invitation)
      : null;
  const funderReturnLoopHub =
    policy.state === 'HOLD'
      ? await findFunderReturnLoopHub(invitation)
      : null;
  const securityClientInviterImmediateSwitch =
    policy.state === 'HOLD' &&
    hasHighSignal(signals, 'SECURITY_CLIENT_INVITER_IMMEDIATE_SWITCH');

  const evidenceSummary = {
    behaviorPatternEnforcementVersion:
      SYBIL_V2_BEHAVIOR_ENFORCEMENT_VERSION,
    signalCount: signals.length,
    signalCodes: unique(signals.map((signal) => signal.code)),
    evidenceFamilies: policy.evidenceFamilies,
    strongEvidenceFamilies: policy.strongEvidenceFamilies,
    evidenceDomains: policy.evidenceDomains,
    strongEvidenceDomains: policy.strongEvidenceDomains,
    checkpoint: checkpoint
      ? {
          analyzerVersion: checkpoint.analyzer_version,
          currentAnalyzerVersion: SYBIL_V2_ANALYZER_VERSION,
          current: checkpointCurrent,
          historicalChainStatus: checkpoint.historical_chain_status,
          fundingChainStatus: checkpoint.funding_chain_status,
          historicalRewardEventCount:
            checkpoint.historical_reward_event_count,
          preactivationB3trOutflowCount:
            checkpoint.preactivation_b3tr_outflow_count,
          attemptCount: checkpoint.attempt_count,
        }
      : null,
    completedChecks,
    requiredChecks: [...REQUIRED_CHECKS],
    finalizedBlock,
    confirmedClusterHub:
      confirmedClusterHub?.wallet_address ?? null,
    confirmedClusterSignature:
      confirmedClusterHub
        ? CONFIRMED_CLUSTER_SIGNATURE_CODE
        : null,
    behaviorPatternHub,
    behaviorPatternAutomaticRestrictionCandidate:
      behaviorPatternHub !== null,
    funderReturnLoopHub,
    funderReturnLoopAutomaticRestrictionCandidate:
      funderReturnLoopHub !== null,
    securityClientInviterImmediateSwitchAutomaticRestrictionCandidate:
      securityClientInviterImmediateSwitch,
    automaticBlacklistEligible:
      confirmedClusterHub !== null ||
      behaviorPatternHub !== null ||
      funderReturnLoopHub !== null ||
      securityClientInviterImmediateSwitch,
  };

  const expectedRevision =
    safeRevision(currentAssessment?.revision) ?? 0;

  const recorded = await recordAssessment({
    invitation,
    state: policy.state,
    riskScore: policy.riskScore,
    evidenceCutoffBlock: finalizedBlock,
    completedChecks,
    reasonCodes: policy.reasonCodes,
    evidenceSummary,
    expectedRevision,
  });

  if (recorded.updated !== true) {
    const fresh = await loadAssessment(normalizedCode);
    return {
      inviteCode: normalizedCode,
      state: (fresh?.state ?? 'ANALYSIS_PENDING') as SybilV2AssessmentResult['state'],
      riskScore: policy.riskScore,
      reasonCodes: policy.reasonCodes,
      revision: safeRevision(fresh?.revision),
      clearanceIssued: false,
      clearanceId: null,
    };
  }

  const revision = safeRevision(recorded.revision);

  if (
    revision !== null &&
    policy.state === 'HOLD' &&
    securityClientInviterImmediateSwitch
  ) {
    const automatic = await applySecurityClientInviterRestriction({
      invitation,
      expectedRevision: revision,
    });
    const automaticRevision = safeRevision(automatic.revision);
    if (automatic.changed === true && automatic.state === 'RESTRICTED') {
      return {
        inviteCode: normalizedCode,
        state: 'RESTRICTED',
        riskScore: 100,
        reasonCodes: unique([
          ...policy.reasonCodes,
          'AUTO_SECURITY_CLIENT_INVITER_RESTRICTION',
        ]),
        revision: automaticRevision ?? revision,
        clearanceIssued: false,
        clearanceId: null,
      };
    }
  }

  if (
    revision !== null &&
    policy.state === 'HOLD' &&
    confirmedClusterHub
  ) {
    const automatic =
      await applyConfirmedClusterBlacklist({
        invitation,
        expectedRevision: revision,
        hubWallet:
          confirmedClusterHub.wallet_address,
      });

    const automaticRevision =
      safeRevision(automatic.revision);

    if (
      automatic.changed === true &&
      automatic.state === 'RESTRICTED'
    ) {
      return {
        inviteCode: normalizedCode,
        state: 'RESTRICTED',
        riskScore: 100,
        reasonCodes: unique([
          ...policy.reasonCodes,
          'AUTO_CONFIRMED_CLUSTER_BLACKLIST',
        ]),
        revision:
          automaticRevision ?? revision,
        clearanceIssued: false,
        clearanceId: null,
      };
    }

    const fresh =
      await loadAssessment(normalizedCode);

    if (fresh?.state === 'RESTRICTED') {
      return {
        inviteCode: normalizedCode,
        state: 'RESTRICTED',
        riskScore: 100,
        reasonCodes: unique([
          ...policy.reasonCodes,
          'AUTO_CONFIRMED_CLUSTER_BLACKLIST',
        ]),
        revision:
          safeRevision(fresh.revision) ??
          automaticRevision ??
          revision,
        clearanceIssued: false,
        clearanceId: null,
      };
    }
  }


  if (
    revision !== null &&
    policy.state === 'HOLD' &&
    funderReturnLoopHub
  ) {
    const automatic =
      await applyFunderReturnLoopRestriction({
        invitation,
        expectedRevision: revision,
        hubWallet: funderReturnLoopHub,
      });

    const automaticRevision =
      safeRevision(automatic.revision);

    if (
      automatic.changed === true &&
      automatic.state === 'RESTRICTED'
    ) {
      return {
        inviteCode: normalizedCode,
        state: 'RESTRICTED',
        riskScore: 100,
        reasonCodes: unique([
          ...policy.reasonCodes,
          'AUTO_FUNDER_RETURN_LOOP_RESTRICTION',
        ]),
        revision:
          automaticRevision ?? revision,
        clearanceIssued: false,
        clearanceId: null,
      };
    }

    const fresh =
      await loadAssessment(normalizedCode);

    if (fresh?.state === 'RESTRICTED') {
      return {
        inviteCode: normalizedCode,
        state: 'RESTRICTED',
        riskScore: 100,
        reasonCodes: unique([
          ...policy.reasonCodes,
          'AUTO_FUNDER_RETURN_LOOP_RESTRICTION',
        ]),
        revision:
          safeRevision(fresh.revision) ??
          automaticRevision ??
          revision,
        clearanceIssued: false,
        clearanceId: null,
      };
    }
  }

  if (
    revision !== null &&
    policy.state === 'HOLD' &&
    behaviorPatternHub
  ) {
    const automatic =
      await applyBehaviorPatternRestriction({
        invitation,
        expectedRevision: revision,
        hubWallet: behaviorPatternHub,
      });

    const automaticRevision =
      safeRevision(automatic.revision);

    if (
      automatic.changed === true &&
      automatic.state === 'RESTRICTED'
    ) {
      return {
        inviteCode: normalizedCode,
        state: 'RESTRICTED',
        riskScore: 100,
        reasonCodes: unique([
          ...policy.reasonCodes,
          'AUTO_BEHAVIOR_PATTERN_RESTRICTION',
        ]),
        revision:
          automaticRevision ?? revision,
        clearanceIssued: false,
        clearanceId: null,
      };
    }

    const fresh =
      await loadAssessment(normalizedCode);

    if (fresh?.state === 'RESTRICTED') {
      return {
        inviteCode: normalizedCode,
        state: 'RESTRICTED',
        riskScore: 100,
        reasonCodes: unique([
          ...policy.reasonCodes,
          'AUTO_BEHAVIOR_PATTERN_RESTRICTION',
        ]),
        revision:
          safeRevision(fresh.revision) ??
          automaticRevision ??
          revision,
        clearanceIssued: false,
        clearanceId: null,
      };
    }
  }

  let clearanceIssued = false;
  let clearanceId: string | null = null;

  if (
    revision !== null &&
    invitation.reward_status !== 'PAID' &&
    policy.state === 'CLEAR'
  ) {
    const clearance = await issueClearance(normalizedCode, revision);
    clearanceIssued = clearance.issued === true;
    clearanceId =
      typeof clearance.clearanceId === 'string'
        ? clearance.clearanceId
        : null;
  }

  return {
    inviteCode: normalizedCode,
    state: policy.state,
    riskScore: policy.riskScore,
    reasonCodes: policy.reasonCodes,
    revision,
    clearanceIssued,
    clearanceId,
  };
}

export async function ensureSybilV2ReadyForReward(
  inviteCode: string,
): Promise<SybilV2AssessmentResult> {
  const evidence = await collectSybilV2EvidenceForInvite(inviteCode);

  if (
    !evidence.historicalChainComplete ||
    !evidence.fundingChainComplete
  ) {
    return assessSybilV2Referral(inviteCode);
  }

  return assessSybilV2Referral(inviteCode);
}

export async function runSybilV2EvidenceCollectionBatch(
  limit = 4,
): Promise<{
  attempted: number;
  completed: number;
  failed: number;
}> {
  const bounded = Math.max(1, Math.min(MAX_BATCH_SIZE, Math.trunc(limit)));

  const { data, error } = await supabaseAdmin
    .from('operator_sybil_v2_scan_candidates')
    .select('invite_code')
    .order('priority_at', {
      ascending: true,
      nullsFirst: true,
    })
    .limit(bounded);

  if (error) {
    throw new Error(
      `Sybil v2 evidence batch candidates could not be loaded: ${error.message}`,
    );
  }

  const candidates = data ?? [];
  let completed = 0;
  let failed = 0;

  for (const candidate of candidates) {
    try {
      const result = await collectSybilV2EvidenceForInvite(
        String(candidate.invite_code),
      );
      if (result.historicalChainComplete && result.fundingChainComplete) {
        completed += 1;
      } else {
        failed += 1;
      }
    } catch {
      failed += 1;
    }
  }

  return {
    attempted: candidates.length,
    completed,
    failed,
  };
}

export async function runSybilV2PolicyReassessmentBatch(
  limit = 10,
): Promise<{
  attempted: number;
  clear: number;
  watch: number;
  hold: number;
  failedOrPending: number;
}> {
  const bounded = Math.max(1, Math.min(MAX_BATCH_SIZE, Math.trunc(limit)));

  const { data: staleData, error: staleError } = await supabaseAdmin
    .from('operator_sybil_v2_policy_reassessment_candidates')
    .select('invite_code,policy_version,state')
    .neq('policy_version', SYBIL_V2_POLICY_VERSION)
    .order('priority_at', {
      ascending: true,
      nullsFirst: true,
    })
    .limit(bounded);

  if (staleError) {
    throw new Error(
      `Sybil v2 policy reassessment candidates could not be loaded: ${staleError.message}`,
    );
  }

  const candidates = [...(staleData ?? [])];
  const seen = new Set(
    candidates.map((candidate) => String(candidate.invite_code)),
  );

  if (candidates.length < bounded) {
    const scanLimit = Math.min(
      100,
      Math.max(25, bounded * 5),
    );
    const { data: currentHoldData, error: currentHoldError } =
      await supabaseAdmin
        .from('operator_sybil_v2_policy_reassessment_candidates')
        .select('invite_code,policy_version,state')
        .eq('policy_version', SYBIL_V2_POLICY_VERSION)
        .eq('state', 'HOLD')
        .order('priority_at', {
          ascending: true,
          nullsFirst: true,
        })
        .limit(scanLimit);

    if (currentHoldError) {
      throw new Error(
        `Sybil v2 behavior reassessment candidates could not be loaded: ${currentHoldError.message}`,
      );
    }

    for (const candidate of currentHoldData ?? []) {
      if (candidates.length >= bounded) break;

      const inviteCode = String(candidate.invite_code);
      if (seen.has(inviteCode)) continue;

      const assessment = await loadAssessment(inviteCode);
      const enforcementVersion =
        assessment?.evidence_summary?.behaviorPatternEnforcementVersion;

      if (
        enforcementVersion ===
        SYBIL_V2_BEHAVIOR_ENFORCEMENT_VERSION
      ) {
        continue;
      }

      candidates.push(candidate);
      seen.add(inviteCode);
    }
  }
  let clear = 0;
  let watch = 0;
  let hold = 0;
  let failedOrPending = 0;

  for (const candidate of candidates) {
    try {
      const result = await ensureSybilV2ReadyForReward(
        String(candidate.invite_code),
      );
      if (result.state === 'CLEAR') clear += 1;
      else if (result.state === 'WATCH') watch += 1;
      else if (result.state === 'HOLD' || result.state === 'RESTRICTED') {
        hold += 1;
      } else {
        failedOrPending += 1;
      }
    } catch {
      failedOrPending += 1;
    }
  }

  return {
    attempted: candidates.length,
    clear,
    watch,
    hold,
    failedOrPending,
  };
}

export async function runSybilV2AssessmentBatch(
  limit = 10,
): Promise<{
  attempted: number;
  clear: number;
  watch: number;
  hold: number;
  failedOrPending: number;
}> {
  const bounded = Math.max(
    1,
    Math.min(MAX_ASSESSMENT_BATCH_SIZE, Math.trunc(limit)),
  );

  const { data, error } = await supabaseAdmin
    .from('operator_sybil_v2_assessment_candidates')
    .select('invite_code')
    .order('priority_at', {
      ascending: true,
      nullsFirst: true,
    })
    .limit(bounded);

  if (error) {
    throw new Error(
      `Sybil v2 assessment batch candidates could not be loaded: ${error.message}`,
    );
  }

  const candidates = [...(data ?? [])];
  const seen = new Set(
    candidates.map((candidate) => String(candidate.invite_code)),
  );

  // Recovery/pre-vote path: raw chain evidence is collected at activation, so
  // scan completed unpaid referrals even before reward eligibility. A new
  // policy version or newly confirmed cluster hub also invalidates the prior
  // SYSTEM assessment once, allowing retrospective protection of unpaid users.
  if (candidates.length < bounded) {
    const [
      { data: checkpoints, error: checkpointError },
      { data: latestHubRows, error: hubError },
      { data: latestRestrictionRows, error: restrictionError },
    ] = await Promise.all([
      supabaseAdmin
        .from('sybil_v2_scan_checkpoints')
        .select('invite_code,checked_at')
        .eq('historical_chain_status', 'COMPLETE')
        .eq('funding_chain_status', 'COMPLETE')
        .order('checked_at', {
          ascending: false,
          nullsFirst: false,
        })
        .limit(Math.max(100, bounded * 8)),
      supabaseAdmin
        .from('sybil_v2_confirmed_cluster_hubs')
        .select('confirmed_at')
        .eq('status', 'ACTIVE')
        .is('revoked_at', null)
        .order('confirmed_at', { ascending: false })
        .limit(1),
      supabaseAdmin
        .from('sybil_v2_wallet_restrictions')
        .select('imposed_at')
        .eq('status', 'ACTIVE')
        .order('imposed_at', { ascending: false })
        .limit(1),
    ]);

    if (checkpointError) {
      throw new Error(
        `Sybil v2 pre-vote assessment checkpoints could not be loaded: ${checkpointError.message}`,
      );
    }
    if (hubError) {
      throw new Error(
        `Sybil v2 confirmed-hub freshness could not be loaded: ${hubError.message}`,
      );
    }
    if (restrictionError) {
      throw new Error(
        `Sybil v2 restriction freshness could not be loaded: ${restrictionError.message}`,
      );
    }

    const latestHubConfirmedAt =
      typeof latestHubRows?.[0]?.confirmed_at === 'string'
        ? Date.parse(latestHubRows[0].confirmed_at)
        : Number.NaN;
    const latestRestrictionAt =
      typeof latestRestrictionRows?.[0]?.imposed_at === 'string'
        ? Date.parse(latestRestrictionRows[0].imposed_at)
        : Number.NaN;

    for (const checkpoint of checkpoints ?? []) {
      if (candidates.length >= bounded) break;

      const inviteCode = String(checkpoint.invite_code);
      if (seen.has(inviteCode)) continue;

      const invitation = await loadInvitation(inviteCode);
      if (
        !invitation ||
        !invitation.invitee_wallet ||
        !['ACTIVATING', 'UNDER_REVIEW', 'COMPLETED'].includes(
          invitation.status,
        ) ||
        ['PAID', 'FORFEITED'].includes(invitation.reward_status)
      ) {
        continue;
      }

      const assessment = await loadAssessment(inviteCode);
      if (
        assessment?.source === 'OPERATOR'
      ) {
        continue;
      }

      const assessedAt = assessment?.updated_at
        ? Date.parse(assessment.updated_at)
        : Number.NaN;
      const stalePolicy =
        assessment !== null &&
        assessment.policy_version !== SYBIL_V2_POLICY_VERSION;
      const staleConfirmedHub =
        assessment !== null &&
        !Number.isNaN(latestHubConfirmedAt) &&
        (Number.isNaN(assessedAt) || assessedAt < latestHubConfirmedAt);
      // A dense cluster can become decisive only after sibling wallets are
      // restricted. Revisit SYSTEM HOLDs after a newer restriction appears so
      // HOLD -> RESTRICTED can happen automatically without operator prompting.
      const staleRestrictionPeer =
        assessment?.state === 'HOLD' &&
        !Number.isNaN(latestRestrictionAt) &&
        (Number.isNaN(assessedAt) || assessedAt < latestRestrictionAt);

      if (
        assessment !== null &&
        !stalePolicy &&
        !staleConfirmedHub &&
        !staleRestrictionPeer
      ) {
        continue;
      }

      candidates.push({ invite_code: inviteCode });
      seen.add(inviteCode);
    }
  }

  let clear = 0;
  let watch = 0;
  let hold = 0;
  let failedOrPending = 0;

  for (const candidate of candidates) {
    try {
      const result = await ensureSybilV2ReadyForReward(
        String(candidate.invite_code),
      );
      if (result.state === 'CLEAR') clear += 1;
      else if (result.state === 'WATCH') watch += 1;
      else if (result.state === 'HOLD' || result.state === 'RESTRICTED') {
        hold += 1;
      } else {
        failedOrPending += 1;
      }
    } catch {
      failedOrPending += 1;
    }
  }

  return {
    attempted: candidates.length,
    clear,
    watch,
    hold,
    failedOrPending,
  };
}
