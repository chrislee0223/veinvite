import 'server-only';

import { supabaseAdmin } from '@/lib/supabaseServer';
import type {
  SybilV2EvidenceFamily,
  SybilV2Signal,
  SybilV2SignalStrength,
} from '@/lib/sybil/v2/policy';
import {
  detectRapidRewardConsolidation,
} from '@/lib/sybil/v2/rapidRewardConsolidation';

type EvidenceRecordInput = {
  subjectWallet: string;
  family: SybilV2EvidenceFamily;
  signalCode: string;
  strength: SybilV2SignalStrength;
  score: number;
  relatedWallet: string | null;
  evidence: Record<string, unknown>;
  dedupeKey: string;
};

export async function loadRapidRewardConsolidationSignals({
  inviteCode,
  network,
  walletAddress,
  protocolDestinations,
  persistEvidence,
}: {
  inviteCode: string;
  network: string | null;
  walletAddress: string | null;
  protocolDestinations: Set<string>;
  persistEvidence: (
    input: EvidenceRecordInput,
  ) => Promise<void>;
}): Promise<SybilV2Signal[]> {
  if (!network || !walletAddress) return [];

  const wallet = walletAddress.trim().toLowerCase();
  const [rewardResult, outflowResult] = await Promise.all([
    supabaseAdmin
      .from('sybil_v2_historical_reward_events')
      .select('block_timestamp,amount_wei')
      .eq('network', network)
      .eq('wallet_address', wallet),
    supabaseAdmin
      .from('sybil_v2_preactivation_b3tr_outflows')
      .select('destination_wallet,block_timestamp,amount_wei')
      .eq('network', network)
      .eq('wallet_address', wallet),
  ]);

  if (rewardResult.error) {
    throw new Error(
      `Rapid reward consolidation rewards could not be loaded: ${rewardResult.error.message}`,
    );
  }
  if (outflowResult.error) {
    throw new Error(
      `Rapid reward consolidation outflows could not be loaded: ${outflowResult.error.message}`,
    );
  }

  const finding = detectRapidRewardConsolidation({
    rewards: (rewardResult.data ?? []).map((row) => ({
      blockTimestamp: String(row.block_timestamp ?? ''),
      amountWei: String(row.amount_wei ?? ''),
    })),
    outflows: (outflowResult.data ?? []).map((row) => ({
      destinationWallet: String(row.destination_wallet ?? ''),
      blockTimestamp: String(row.block_timestamp ?? ''),
      amountWei: String(row.amount_wei ?? ''),
    })),
    knownProtocolDestinations: protocolDestinations,
  });

  if (!finding) return [];

  await persistEvidence({
    subjectWallet: wallet,
    family: finding.signal.family,
    signalCode: finding.signal.code,
    strength: finding.signal.strength,
    score: finding.signal.score,
    relatedWallet: finding.dominantDestination,
    evidence: {
      rewardEventCount: finding.rewardEventCount,
      rapidRewardEventCount: finding.rapidRewardEventCount,
      rapidRewardShareBps: finding.rapidRewardShareBps,
      rewardSpanSeconds: finding.rewardSpanSeconds,
      totalRewardWei: finding.totalRewardWei,
      totalOutflowWei: finding.totalOutflowWei,
      outflowCoverageBps: finding.outflowCoverageBps,
      dominantDestinationShareBps:
        finding.dominantDestinationShareBps,
      maxDelaySeconds: finding.maxDelaySeconds,
      behaviorPattern: 'RAPID_REWARD_CONSOLIDATION_V1',
      automaticRestriction: false,
    },
    dedupeKey:
      `sybil-v2:${inviteCode}:historical-rapid-reward-consolidation:${finding.dominantDestination}`,
  });

  return [finding.signal];
}
