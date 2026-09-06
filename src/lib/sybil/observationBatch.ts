import 'server-only';

import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  evaluateOnchainFundingIndicators,
  readOnchainFundingSnapshot,
  type OnchainFundingSnapshot,
} from '@/lib/sybil/onchainAnalytics';
import { getVeBetterNetworkConfig } from '@/lib/vebetter/network';

export const SYBIL_OBSERVATION_RULE_VERSION = 'observation-v1';
export const SYBIL_ONCHAIN_ANALYZER_VERSION = 'onchain-funding-v1';
export const DEFAULT_SYBIL_OBSERVATION_BATCH_SIZE = 3;
const MAX_SYBIL_OBSERVATION_BATCH_SIZE = 10;

type InvitationCandidate = {
  invite_code: string;
  invitee_wallet: string | null;
  activation_block: number | string | null;
  activation_network: string | null;
};

type PendingObservation = {
  candidate: InvitationCandidate;
  snapshot: OnchainFundingSnapshot;
};

type FunderField =
  | 'first_inbound_vet_sender'
  | 'first_inbound_vtho_sender';

export type SybilObservationBatchFailure = {
  inviteCode: string;
  error: string;
};

export type SybilObservationBatchSummary = {
  enabled: boolean;
  ruleVersion: string;
  analyzerVersion: string;
  considered: number;
  analyzed: number;
  inserted: number;
  skippedExisting: number;
  failures: SybilObservationBatchFailure[];
};

function observationEnabled() {
  return process.env.SYBIL_OBSERVATION_ENABLED === 'true';
}

function parseActivationBlock(value: number | string | null) {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d+$/.test(value)
        ? Number(value)
        : null;

  return parsed !== null &&
    Number.isSafeInteger(parsed) &&
    parsed > 0
    ? parsed
    : null;
}

function normalizeBatchSize(value: number) {
  if (!Number.isSafeInteger(value) || value < 1) {
    return DEFAULT_SYBIL_OBSERVATION_BATCH_SIZE;
  }

  return Math.min(value, MAX_SYBIL_OBSERVATION_BATCH_SIZE);
}

async function countExistingFunderObservations(
  field: FunderField,
  sender: string,
) {
  const { network } = getVeBetterNetworkConfig();
  const result = await supabaseAdmin
    .from('sybil_onchain_snapshots')
    .select('invite_code', { count: 'exact', head: true })
    .eq('network', network)
    .eq('analyzer_version', SYBIL_ONCHAIN_ANALYZER_VERSION)
    .eq(field, sender);

  if (result.error) {
    throw new Error(
      `Could not count existing ${field} observations: ${result.error.message}`,
    );
  }

  return result.count ?? 0;
}

function frequency(values: Array<string | null>) {
  const counts = new Map<string, number>();

  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return counts;
}

async function loadExistingFunderCounts(
  field: FunderField,
  values: Array<string | null>,
) {
  const unique = Array.from(
    new Set(values.filter((value): value is string => Boolean(value))),
  );
  const entries = await Promise.all(
    unique.map(async (value) => [
      value,
      await countExistingFunderObservations(field, value),
    ] as const),
  );

  return new Map(entries);
}

function safeErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message.slice(0, 500)
    : 'Unknown Sybil observation error.';
}

export async function runSybilObservationBatch(
  requestedBatchSize = DEFAULT_SYBIL_OBSERVATION_BATCH_SIZE,
): Promise<SybilObservationBatchSummary> {
  const summary: SybilObservationBatchSummary = {
    enabled: observationEnabled(),
    ruleVersion: SYBIL_OBSERVATION_RULE_VERSION,
    analyzerVersion: SYBIL_ONCHAIN_ANALYZER_VERSION,
    considered: 0,
    analyzed: 0,
    inserted: 0,
    skippedExisting: 0,
    failures: [],
  };

  if (!summary.enabled) {
    return summary;
  }

  const batchSize = normalizeBatchSize(requestedBatchSize);
  const config = getVeBetterNetworkConfig();
  const candidateResult = await supabaseAdmin
    .from('invitations')
    .select(
      'invite_code, invitee_wallet, activation_block, activation_network',
    )
    .in('status', ['ACTIVATING', 'COMPLETED'])
    .not('invitee_wallet', 'is', null)
    .not('activation_block', 'is', null)
    .eq('activation_network', config.network)
    .order('activated_at', { ascending: true })
    .limit(batchSize * 4);

  if (candidateResult.error) {
    throw new Error(
      `Could not load Sybil observation candidates: ${candidateResult.error.message}`,
    );
  }

  const candidates =
    (candidateResult.data ?? []) as InvitationCandidate[];
  summary.considered = candidates.length;

  if (candidates.length === 0) {
    return summary;
  }

  const inviteCodes = candidates.map((row) => row.invite_code);
  const existingResult = await supabaseAdmin
    .from('sybil_onchain_snapshots')
    .select('invite_code')
    .eq('analyzer_version', SYBIL_ONCHAIN_ANALYZER_VERSION)
    .in('invite_code', inviteCodes);

  if (existingResult.error) {
    throw new Error(
      `Could not load existing Sybil observations: ${existingResult.error.message}`,
    );
  }

  const existingCodes = new Set(
    (existingResult.data ?? []).map((row) => row.invite_code as string),
  );
  summary.skippedExisting = existingCodes.size;

  const pending: PendingObservation[] = [];

  for (const candidate of candidates) {
    if (pending.length >= batchSize) break;
    if (existingCodes.has(candidate.invite_code)) continue;

    const activationBlock = parseActivationBlock(
      candidate.activation_block,
    );
    const walletAddress = candidate.invitee_wallet?.toLowerCase() ?? null;

    if (!activationBlock || !walletAddress) {
      summary.failures.push({
        inviteCode: candidate.invite_code,
        error: 'Candidate is missing a valid activation block or invitee wallet.',
      });
      continue;
    }

    try {
      const snapshot = await readOnchainFundingSnapshot({
        walletAddress,
        activationBlock,
      });
      pending.push({ candidate, snapshot });
      summary.analyzed += 1;
    } catch (error) {
      summary.failures.push({
        inviteCode: candidate.invite_code,
        error: safeErrorMessage(error),
      });
    }
  }

  if (pending.length === 0) {
    return summary;
  }

  const vetFunders = pending.map(
    ({ snapshot }) => snapshot.firstInboundVet?.sender ?? null,
  );
  const vthoFunders = pending.map(
    ({ snapshot }) => snapshot.firstInboundVtho?.sender ?? null,
  );
  const vetBatchFrequency = frequency(vetFunders);
  const vthoBatchFrequency = frequency(vthoFunders);
  const [existingVetCounts, existingVthoCounts] = await Promise.all([
    loadExistingFunderCounts('first_inbound_vet_sender', vetFunders),
    loadExistingFunderCounts('first_inbound_vtho_sender', vthoFunders),
  ]);

  for (const { candidate, snapshot } of pending) {
    const vetFunder = snapshot.firstInboundVet?.sender ?? null;
    const vthoFunder = snapshot.firstInboundVtho?.sender ?? null;
    const correlation = {
      vetFunderReferralCount: vetFunder
        ? (existingVetCounts.get(vetFunder) ?? 0) +
          (vetBatchFrequency.get(vetFunder) ?? 0)
        : 0,
      vthoFunderReferralCount: vthoFunder
        ? (existingVthoCounts.get(vthoFunder) ?? 0) +
          (vthoBatchFrequency.get(vthoFunder) ?? 0)
        : 0,
    };
    const evaluation = evaluateOnchainFundingIndicators({
      snapshot,
      correlation,
    });

    const insertResult = await supabaseAdmin
      .from('sybil_onchain_snapshots')
      .insert({
        invite_code: candidate.invite_code,
        wallet_address: snapshot.walletAddress,
        network: snapshot.network,
        activation_block: snapshot.activationBlock,
        first_observed_activity_block:
          snapshot.firstObservedActivityBlock,
        age_blocks_at_activation: snapshot.ageBlocksAtActivation,
        approximate_age_seconds_at_activation:
          snapshot.approximateAgeSecondsAtActivation,
        first_inbound_vet_block:
          snapshot.firstInboundVet?.blockNumber ?? null,
        first_inbound_vet_sender:
          snapshot.firstInboundVet?.sender ?? null,
        first_inbound_vet_tx_id:
          snapshot.firstInboundVet?.txId?.toLowerCase() ?? null,
        first_inbound_vtho_block:
          snapshot.firstInboundVtho?.blockNumber ?? null,
        first_inbound_vtho_sender:
          snapshot.firstInboundVtho?.sender ?? null,
        first_inbound_vtho_tx_id:
          snapshot.firstInboundVtho?.txId?.toLowerCase() ?? null,
        vet_funder_referral_count:
          correlation.vetFunderReferralCount,
        vtho_funder_referral_count:
          correlation.vthoFunderReferralCount,
        indicators: evaluation.indicators,
        observation_only: true,
        rule_version: SYBIL_OBSERVATION_RULE_VERSION,
        analyzer_version: SYBIL_ONCHAIN_ANALYZER_VERSION,
        checked_at: snapshot.checkedAt,
      });

    if (insertResult.error) {
      if (insertResult.error.code === '23505') {
        summary.skippedExisting += 1;
        continue;
      }

      summary.failures.push({
        inviteCode: candidate.invite_code,
        error: `Could not persist observation: ${insertResult.error.message}`,
      });
      continue;
    }

    summary.inserted += 1;
  }

  return summary;
}
