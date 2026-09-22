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
  getVeBetterNetworkConfig,
  type VeBetterNetwork,
} from '@/lib/vebetter/network';

export const SYBIL_V2_ANALYZER_VERSION = 'sybil-v2.0';

const REQUIRED_CHECKS = [
  'HISTORICAL_CHAIN',
  'FUNDING_CHAIN',
  'MISSION_BEHAVIOR',
  'SECURITY_IDENTITY',
  'CHAIN_FINALITY',
] as const;

const SYNC_REWARD_BLOCK_WINDOW = 30;
const MISSION_PEER_WINDOW_SECONDS = 7 * 24 * 60 * 60;
const MAX_BATCH_SIZE = 10;

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
    | 'WATCH'
    | 'HOLD'
    | 'RESTRICTED';
  riskScore: number;
  reasonCodes: string[];
  revision: number | null;
  clearanceIssued: boolean;
  clearanceId: string | null;
};

function safePositiveBlock(value: number | string | null): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function safeNonNegativeBlock(value: number | string | null): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function safeRevision(value: number | string | null | undefined): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 1000);
}

function normalizeWallet(value: string): string {
  return value.trim().toLowerCase();
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function knownProtocolDestinations(): Set<string> {
  const config = getVeBetterNetworkConfig();
  return new Set([
    '0x0000000000000000000000000000000000000000',
    config.b3trAddress.toLowerCase(),
    config.vot3Address.toLowerCase(),
    config.x2EarnAppsAddress.toLowerCase(),
    config.x2EarnRewardsPoolAddress.toLowerCase(),
    config.xAllocationVotingAddress.toLowerCase(),
  ]);
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
  let historicalStatus: ScanCheckpoint['historical_chain_status'] =
    previous?.historical_chain_status === 'COMPLETE' ? 'COMPLETE' : 'PENDING';
  let fundingStatus: ScanCheckpoint['funding_chain_status'] =
    previous?.funding_chain_status === 'COMPLETE' ? 'COMPLETE' : 'PENDING';
  let historicalRewardEvents = previous?.historical_reward_event_count ?? 0;
  let b3trOutflows = previous?.preactivation_b3tr_outflow_count ?? 0;
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
          !knownProtocolDestinations().has(destination),
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
    knownProtocolDestinations: knownProtocolDestinations(),
    minimumBlock,
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
      },
      dedupeKey:
        `sybil-v2:${invitation.invite_code}:${finding.signal.code.toLowerCase()}:${finding.destinationWallet}`,
    });
  }

  return findings.map((finding) => finding.signal);
}

async function loadFundingSignals(
  invitation: InvitationV2Row,
): Promise<SybilV2Signal[]> {
  if (!invitation.activation_network || !invitation.invitee_wallet) return [];

  const subject = normalizeWallet(invitation.invitee_wallet);
  const ownResult = await supabaseAdmin
    .from('sybil_v2_evidence_records')
    .select('signal_code,related_wallet')
    .eq('invite_code', invitation.invite_code)
    .eq('evidence_family', 'FUNDING')
    .in('signal_code', ['FIRST_VET_FUNDER', 'FIRST_VTHO_FUNDER']);

  if (ownResult.error) {
    throw new Error(`Funding evidence could not be loaded: ${ownResult.error.message}`);
  }

  const signals: SybilV2Signal[] = [];

  for (const row of ownResult.data ?? []) {
    const signalCode = String(row.signal_code ?? '');
    const funder = typeof row.related_wallet === 'string'
      ? normalizeWallet(row.related_wallet)
      : null;
    if (!funder) continue;

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
      (peers.data ?? []).map((peer) => normalizeWallet(String(peer.subject_wallet))),
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

  return signals;
}

function intervalsSimilar(
  left: Array<number | string> | null,
  right: Array<number | string> | null,
): boolean {
  if (!left || !right || left.length === 0 || left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => {
    const a = Number(value);
    const b = Number(right[index]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
    const absolute = Math.abs(a - b);
    const relative = absolute / Math.max(60, a, b);
    return absolute <= 600 && relative <= 0.35;
  });
}

function appOverlap(left: string[], right: string[]): number {
  const a = new Set(left);
  const b = new Set(right);
  const union = new Set([...a, ...b]);
  if (union.size === 0) return 0;
  let intersection = 0;
  for (const value of a) {
    if (b.has(value)) intersection += 1;
  }
  return intersection / union.size;
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

async function loadSecurityIdentitySignals(
  invitation: InvitationV2Row,
): Promise<{
  signals: SybilV2Signal[];
  complete: boolean;
}> {
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
    const score = sameInviterClient ? 45 : relatedRewarded ? 40 : 30;
    signals.push({
      code: sameInviterClient
        ? 'SECURITY_CLIENT_INVITER_LINK'
        : 'SECURITY_CLIENT_PARTICIPANT_LINK',
      family: 'SECURITY_IDENTITY',
      strength: 'MEDIUM',
      score,
    });

    await insertEvidenceRecord({
      invitation,
      subjectWallet: invitation.invitee_wallet!,
      family: 'SECURITY_IDENTITY',
      signalCode: sameInviterClient
        ? 'SECURITY_CLIENT_INVITER_LINK'
        : 'SECURITY_CLIENT_PARTICIPANT_LINK',
      strength: 'MEDIUM',
      score,
      relatedWallet: sameInviterClient ? invitation.inviter_wallet : null,
      evidence,
      dedupeKey:
        `sybil-v2:${invitation.invite_code}:security-identity-link`,
    });
  }

  return { signals, complete: true };
}

async function hasActiveRestriction(
  invitation: InvitationV2Row,
): Promise<boolean> {
  if (!invitation.activation_network || !invitation.invitee_wallet) return false;

  const wallets = [
    normalizeWallet(invitation.inviter_wallet),
    normalizeWallet(invitation.invitee_wallet),
  ];

  const { data, error } = await supabaseAdmin
    .from('sybil_v2_wallet_restrictions')
    .select('id')
    .eq('network', invitation.activation_network)
    .eq('status', 'ACTIVE')
    .in('wallet_address', wallets)
    .limit(1);

  if (error) {
    throw new Error(`Sybil v2 wallet restrictions could not be loaded: ${error.message}`);
  }

  return (data ?? []).length > 0;
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
    .select('invite_code,state,revision,source')
    .eq('invite_code', inviteCode)
    .maybeSingle();

  if (error) {
    throw new Error(`Sybil v2 assessment could not be loaded: ${error.message}`);
  }

  return data as AssessmentRow | null;
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

  const checkpoint = await loadCheckpoint(normalizedCode);
  const completedChecks: string[] = [];
  const analysisFailed =
    checkpoint?.historical_chain_status === 'FAILED' ||
    checkpoint?.funding_chain_status === 'FAILED';

  if (checkpoint?.historical_chain_status === 'COMPLETE') {
    completedChecks.push('HISTORICAL_CHAIN');
  }
  if (checkpoint?.funding_chain_status === 'COMPLETE') {
    completedChecks.push('FUNDING_CHAIN');
  }

  const signals: SybilV2Signal[] = [];

  if (checkpoint?.historical_chain_status === 'COMPLETE') {
    signals.push(...await loadHistoricalRewardSignals(invitation));
    signals.push(...await loadConsolidationSignals(invitation));
  }

  if (checkpoint?.funding_chain_status === 'COMPLETE') {
    signals.push(...await loadFundingSignals(invitation));
  }

  const mission = await loadMissionBehaviorSignals(invitation);
  signals.push(...mission.signals);
  if (mission.complete) completedChecks.push('MISSION_BEHAVIOR');

  const security = await loadSecurityIdentitySignals(invitation);
  signals.push(...security.signals);
  if (security.complete) completedChecks.push('SECURITY_IDENTITY');

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
  const requiredChecksComplete = REQUIRED_CHECKS.every((check) =>
    completedChecks.includes(check),
  );

  const policy = evaluateSybilV2Policy({
    signals,
    requiredChecksComplete,
    analysisFailed:
      analysisFailed ||
      (
        invitation.status === 'COMPLETED' &&
        invitation.reward_status === 'ELIGIBLE' &&
        finalizedBlock === null
      ),
    activeRestriction,
  });

  const evidenceSummary = {
    signalCount: signals.length,
    signalCodes: unique(signals.map((signal) => signal.code)),
    evidenceFamilies: policy.evidenceFamilies,
    strongEvidenceFamilies: policy.strongEvidenceFamilies,
    checkpoint: checkpoint
      ? {
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
  let clearanceIssued = false;
  let clearanceId: string | null = null;

  if (
    revision !== null &&
    (policy.state === 'CLEAR' || policy.state === 'WATCH')
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

export async function runSybilV2AssessmentBatch(
  limit = 10,
): Promise<{
  attempted: number;
  clear: number;
  watch: number;
  hold: number;
  failedOrPending: number;
}> {
  const bounded = Math.max(1, Math.min(MAX_BATCH_SIZE, Math.trunc(limit)));

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

  const candidates = data ?? [];
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
