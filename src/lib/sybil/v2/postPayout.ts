import 'server-only';

import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  evaluateSybilV2Policy,
  type SybilV2EvidenceFamily,
  type SybilV2Signal,
  type SybilV2SignalStrength,
} from '@/lib/sybil/v2/policy';

type PostPayoutIndicator = {
  code: string;
  level: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH';
  score: number;
  message: string;
};

type PostPayoutSnapshot = {
  receiptId: number;
  network: string;
  inviteCode: string;
  recipientWallet: string;
  payoutTxId: string;
  payoutBlockNumber: number;
  scanToBlock: number;
  firstOutboundDestination: string | null;
  dominantDestination: string | null;
  sharedDestinationRecipientCount: number;
  knownProtocolDestination: boolean;
  indicators: PostPayoutIndicator[];
};

type PostPayoutBridgeCandidateRow = {
  receipt_id: number | string;
  invite_code: string;
  network: string;
  recipient_wallet: string;
  payout_tx_id: string;
  payout_block_number: number | string;
  scan_to_block: number | string;
  first_outbound_destination: string | null;
  dominant_destination: string | null;
  shared_destination_recipient_count: number | string;
  known_protocol_destination: boolean;
  indicators: unknown;
};

type ExistingEvidenceRow = {
  evidence_family: SybilV2EvidenceFamily;
  signal_code: string;
  strength: SybilV2SignalStrength;
  score: number;
  related_wallet: string | null;
};

type RecipientClusterRow = {
  receipt_id: number | string;
  recipient_wallet: string;
  dominant_destination: string | null;
  known_protocol_destination: boolean;
};

type AuditLedgerRow = {
  receipt_id: number | string;
  invite_code: string;
  recipient_wallet: string;
};

const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/;
const MAX_CLUSTER_RECIPIENTS = 100;

function normalizeWallet(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!ADDRESS_PATTERN.test(normalized)) {
    throw new Error('Post-payout Sybil v2 received an invalid wallet.');
  }
  return normalized;
}

function strengthForLevel(
  level: PostPayoutIndicator['level'],
): SybilV2SignalStrength {
  return level;
}

function safeScore(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}


function safeNonNegativeInteger(
  value: unknown,
  label: string,
): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d+$/u.test(value)
        ? Number(value)
        : Number.NaN;

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 0
  ) {
    throw new Error(
      `Post-payout Sybil v2 candidate has invalid ${label}.`,
    );
  }

  return parsed;
}

function parseIndicators(
  value: unknown,
): PostPayoutIndicator[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (
      !item ||
      typeof item !== 'object' ||
      Array.isArray(item)
    ) {
      return [];
    }

    const record = item as Record<string, unknown>;
    const code = typeof record.code === 'string'
      ? record.code
      : '';
    const level = typeof record.level === 'string'
      ? record.level
      : '';
    const message = typeof record.message === 'string'
      ? record.message
      : '';
    const score = safeScore(record.score);

    if (
      !code ||
      !['INFO', 'LOW', 'MEDIUM', 'HIGH'].includes(level)
    ) {
      return [];
    }

    return [{
      code,
      level:
        level as PostPayoutIndicator['level'],
      score,
      message,
    }];
  });
}

async function insertPostPayoutEvidence({
  inviteCode,
  network,
  subjectWallet,
  signalCode,
  strength,
  score,
  relatedWallet,
  observedBlock,
  evidence,
  dedupeKey,
}: {
  inviteCode: string;
  network: string;
  subjectWallet: string;
  signalCode: string;
  strength: SybilV2SignalStrength;
  score: number;
  relatedWallet: string | null;
  observedBlock: number | null;
  evidence: Record<string, unknown>;
  dedupeKey: string;
}) {
  const { error } = await supabaseAdmin
    .from('sybil_v2_evidence_records')
    .upsert({
      invite_code: inviteCode,
      network,
      subject_wallet: normalizeWallet(subjectWallet),
      evidence_family: 'POST_PAYOUT',
      signal_code: signalCode,
      strength,
      score: safeScore(score),
      related_wallet: relatedWallet
        ? normalizeWallet(relatedWallet)
        : null,
      app_id: null,
      observed_block: observedBlock,
      observed_at: new Date().toISOString(),
      analyzer_version: 'sybil-v2.0',
      evidence,
      dedupe_key: dedupeKey,
    }, {
      onConflict: 'dedupe_key',
      ignoreDuplicates: true,
    });

  if (error && error.code !== '23505') {
    throw new Error(
      `Post-payout Sybil v2 evidence could not be stored: ${error.message}`,
    );
  }
}

async function loadAllSignals(
  inviteCode: string,
): Promise<SybilV2Signal[]> {
  const { data, error } = await supabaseAdmin
    .from('sybil_v2_evidence_records')
    .select(
      'evidence_family,signal_code,strength,score,related_wallet',
    )
    .eq('invite_code', inviteCode);

  if (error) {
    throw new Error(
      `Post-payout Sybil v2 evidence could not be loaded: ${error.message}`,
    );
  }

  return ((data ?? []) as ExistingEvidenceRow[])
    .map((row) => ({
      code: row.signal_code,
      family: row.evidence_family,
      strength: row.strength,
      score: safeScore(row.score),
      ...(row.related_wallet
        ? { independentKey: row.related_wallet }
        : {}),
    }));
}

async function maybeOpenPostPayoutReview({
  inviteCode,
  network,
  subjectWallet,
  context,
}: {
  inviteCode: string;
  network: string;
  subjectWallet: string;
  context: Record<string, unknown>;
}) {
  const signals = await loadAllSignals(inviteCode);
  const policy = evaluateSybilV2Policy({
    signals,
    requiredChecksComplete: true,
  });

  if (
    policy.state !== 'HOLD' ||
    !policy.strongEvidenceFamilies.includes('POST_PAYOUT')
  ) {
    return {
      opened: false,
      state: policy.state,
      riskScore: policy.riskScore,
    };
  }

  const { data, error } = await supabaseAdmin.rpc(
    'record_sybil_v2_post_payout_review',
    {
      p_invite_code: inviteCode,
      p_network: network,
      p_subject_wallet: normalizeWallet(subjectWallet),
      p_risk_score: policy.riskScore,
      p_reason_codes: policy.reasonCodes,
      p_evidence_summary: {
        ...context,
        evidenceFamilies: policy.evidenceFamilies,
        strongEvidenceFamilies:
          policy.strongEvidenceFamilies,
      },
    },
  );

  if (error) {
    throw new Error(
      `Post-payout Sybil v2 review could not be opened: ${error.message}`,
    );
  }

  const result =
    data && typeof data === 'object'
      ? data as Record<string, unknown>
      : {};

  return {
    opened: result.changed === true,
    state: 'HOLD',
    riskScore: policy.riskScore,
  };
}

async function materializeSharedDestinationCluster({
  network,
  destination,
  scanToBlock,
}: {
  network: string;
  destination: string;
  scanToBlock: number;
}) {
  const clusterResult = await supabaseAdmin
    .from('reward_recipient_b3tr_flow_snapshots')
    .select(
      'receipt_id,recipient_wallet,dominant_destination,known_protocol_destination',
    )
    .eq('network', network)
    .eq('dominant_destination', destination)
    .eq('known_protocol_destination', false)
    .order('receipt_id', { ascending: true })
    .limit(MAX_CLUSTER_RECIPIENTS);

  if (clusterResult.error) {
    throw new Error(
      `Post-payout destination cluster could not be loaded: ${clusterResult.error.message}`,
    );
  }

  const clusterRows =
    (clusterResult.data ?? []) as RecipientClusterRow[];
  const recipientWallets = new Set(
    clusterRows.map((row) =>
      normalizeWallet(row.recipient_wallet),
    ),
  );
  const clusterCount = recipientWallets.size;

  if (clusterCount < 3) return;

  const receiptIds = clusterRows.map((row) =>
    Number(row.receipt_id),
  );
  const ledgerResult = await supabaseAdmin
    .from('reward_recipient_audit_ledger')
    .select('receipt_id,invite_code,recipient_wallet')
    .in('receipt_id', receiptIds);

  if (ledgerResult.error) {
    throw new Error(
      `Post-payout destination cluster ledger could not be loaded: ${ledgerResult.error.message}`,
    );
  }

  const ledgerRows =
    (ledgerResult.data ?? []) as AuditLedgerRow[];
  const thresholdBucket = clusterCount >= 5 ? 5 : 3;
  const strength: SybilV2SignalStrength =
    clusterCount >= 5 ? 'HIGH' : 'MEDIUM';
  const score = Math.min(
    80,
    20 + clusterCount * 10,
  );

  for (const row of ledgerRows) {
    const subjectWallet =
      normalizeWallet(row.recipient_wallet);

    await insertPostPayoutEvidence({
      inviteCode: row.invite_code,
      network,
      subjectWallet,
      signalCode: 'SHARED_B3TR_DESTINATION',
      strength,
      score,
      relatedWallet: destination,
      observedBlock: scanToBlock,
      evidence: {
        sharedDestinationRecipientCount: clusterCount,
        thresholdBucket,
        destination,
        observationOnly: true,
      },
      dedupeKey:
        `sybil-v2:${row.invite_code}:post-payout:shared-destination:${destination}:threshold-${thresholdBucket}`,
    });

    await maybeOpenPostPayoutReview({
      inviteCode: row.invite_code,
      network,
      subjectWallet,
      context: {
        trigger: 'SHARED_B3TR_DESTINATION',
        destination,
        sharedDestinationRecipientCount:
          clusterCount,
        thresholdBucket,
        scanToBlock,
        pastRewardChanged: false,
      },
    });
  }
}

export async function recordPostPayoutSybilV2Observation(
  snapshot: PostPayoutSnapshot,
): Promise<{
  reviewOpened: boolean;
  clusterRecipientCount: number;
}> {
  const recipientWallet =
    normalizeWallet(snapshot.recipientWallet);

  for (const indicator of snapshot.indicators) {
    if (indicator.score <= 0) continue;

    const relatedWallet =
      indicator.code === 'SHARED_B3TR_DESTINATION'
        ? snapshot.dominantDestination
        : snapshot.firstOutboundDestination ??
          snapshot.dominantDestination;

    await insertPostPayoutEvidence({
      inviteCode: snapshot.inviteCode,
      network: snapshot.network,
      subjectWallet: recipientWallet,
      signalCode: indicator.code,
      strength: strengthForLevel(indicator.level),
      score: indicator.score,
      relatedWallet,
      observedBlock: snapshot.scanToBlock,
      evidence: {
        message: indicator.message,
        receiptId: snapshot.receiptId,
        payoutTxId: snapshot.payoutTxId,
        payoutBlockNumber:
          snapshot.payoutBlockNumber,
        scanToBlock: snapshot.scanToBlock,
        sharedDestinationRecipientCount:
          snapshot.sharedDestinationRecipientCount,
        knownProtocolDestination:
          snapshot.knownProtocolDestination,
        observationOnly: true,
      },
      dedupeKey:
        `sybil-v2:${snapshot.inviteCode}:post-payout:${indicator.code.toLowerCase()}:${snapshot.receiptId}`,
    });
  }

  const review = await maybeOpenPostPayoutReview({
    inviteCode: snapshot.inviteCode,
    network: snapshot.network,
    subjectWallet: recipientWallet,
    context: {
      trigger: 'RECIPIENT_B3TR_OBSERVATION',
      receiptId: snapshot.receiptId,
      payoutTxId: snapshot.payoutTxId,
      scanToBlock: snapshot.scanToBlock,
      sharedDestinationRecipientCount:
        snapshot.sharedDestinationRecipientCount,
      pastRewardChanged: false,
    },
  });

  if (
    snapshot.dominantDestination &&
    !snapshot.knownProtocolDestination &&
    snapshot.sharedDestinationRecipientCount >= 3
  ) {
    await materializeSharedDestinationCluster({
      network: snapshot.network,
      destination:
        normalizeWallet(snapshot.dominantDestination),
      scanToBlock: snapshot.scanToBlock,
    });
  }

  // Completion marker is written last. If any bridge step above fails, the
  // snapshot remains eligible for the recovery/backfill view and will retry.
  await insertPostPayoutEvidence({
    inviteCode: snapshot.inviteCode,
    network: snapshot.network,
    subjectWallet: recipientWallet,
    signalCode: 'POST_PAYOUT_OBSERVATION_COMPLETE',
    strength: 'INFO',
    score: 0,
    relatedWallet: null,
    observedBlock: snapshot.scanToBlock,
    evidence: {
      receiptId: snapshot.receiptId,
      payoutTxId: snapshot.payoutTxId,
      scanToBlock: snapshot.scanToBlock,
      observationOnly: true,
    },
    dedupeKey:
      `sybil-v2:${snapshot.inviteCode}:post-payout:complete:${snapshot.receiptId}`,
  });

  return {
    reviewOpened: review.opened,
    clusterRecipientCount:
      snapshot.sharedDestinationRecipientCount,
  };
}


export async function runPostPayoutSybilV2BridgeBatch(
  limit = 10,
): Promise<{
  attempted: number;
  completed: number;
  failed: number;
  reviewsOpened: number;
}> {
  const bounded = Math.max(
    1,
    Math.min(25, Math.trunc(limit)),
  );

  const { data, error } = await supabaseAdmin
    .from('operator_sybil_v2_post_payout_candidates')
    .select(
      'receipt_id,invite_code,network,recipient_wallet,payout_tx_id,payout_block_number,scan_to_block,first_outbound_destination,dominant_destination,shared_destination_recipient_count,known_protocol_destination,indicators',
    )
    .order('receipt_id', { ascending: true })
    .limit(bounded);

  if (error) {
    throw new Error(
      `Post-payout Sybil v2 bridge candidates could not be loaded: ${error.message}`,
    );
  }

  const rows =
    (data ?? []) as PostPayoutBridgeCandidateRow[];
  let completed = 0;
  let failed = 0;
  let reviewsOpened = 0;

  for (const row of rows) {
    try {
      const result =
        await recordPostPayoutSybilV2Observation({
          receiptId: safeNonNegativeInteger(
            row.receipt_id,
            'receipt_id',
          ),
          inviteCode:
            row.invite_code.trim().toUpperCase(),
          network: row.network,
          recipientWallet:
            normalizeWallet(row.recipient_wallet),
          payoutTxId: row.payout_tx_id.toLowerCase(),
          payoutBlockNumber:
            safeNonNegativeInteger(
              row.payout_block_number,
              'payout_block_number',
            ),
          scanToBlock:
            safeNonNegativeInteger(
              row.scan_to_block,
              'scan_to_block',
            ),
          firstOutboundDestination:
            row.first_outbound_destination
              ? normalizeWallet(
                  row.first_outbound_destination,
                )
              : null,
          dominantDestination:
            row.dominant_destination
              ? normalizeWallet(
                  row.dominant_destination,
                )
              : null,
          sharedDestinationRecipientCount:
            safeNonNegativeInteger(
              row.shared_destination_recipient_count,
              'shared_destination_recipient_count',
            ),
          knownProtocolDestination:
            row.known_protocol_destination === true,
          indicators:
            parseIndicators(row.indicators),
        });

      completed += 1;
      if (result.reviewOpened) {
        reviewsOpened += 1;
      }
    } catch {
      failed += 1;
    }
  }

  return {
    attempted: rows.length,
    completed,
    failed,
    reviewsOpened,
  };
}
