import 'server-only';

import { supabaseAdmin } from '@/lib/supabaseServer';
import { getVeBetterNetwork } from '@/lib/vebetter/network';

export type RewardPayoutPipelineStage =
  | 'IDLE'
  | 'QUEUED'
  | 'ROUND_PREPARED'
  | 'MANIFEST_CREATED'
  | 'CHECKPOINTED'
  | 'SIGNED'
  | 'SUBMITTED'
  | 'WAITING_FINALITY'
  | 'SETTLED'
  | 'ATTENTION_REQUIRED';

export type RewardPayoutHistoryItem = {
  payoutId: string;
  roundId: string;
  veBetterRoundId: string | null;
  inviteCode: string;
  recipientWallet: string;
  amountWei: string;
  status: string;
  txId: string | null;
  attemptCount: number;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  paidAt: string | null;
  receiptId: string | null;
  settlementId: string | null;
  finalizedBlockNumber: string | null;
  finalizedHeadNumber: string | null;
  verifiedAt: string | null;
};

export type RewardPayoutObservability = {
  capturedAt: string;
  network: string;
  pipeline: {
    stage: RewardPayoutPipelineStage;
    diagnosis: string;
    queuedCount: number;
    oldestQueuedAt: string | null;
    roundId: string | null;
    veBetterRoundId: string | null;
    manifestId: string | null;
    txId: string | null;
    latestError: string | null;
  };
  summary: {
    trackedPayouts: number;
    paidPayouts: number;
    pendingPayouts: number;
    payoutsWithErrors: number;
    latestPaidAt: string | null;
    latestPaidTxId: string | null;
  };
  recentPayouts: RewardPayoutHistoryItem[];
  recentFailures: Array<{
    eventId: string;
    payoutId: string;
    roundId: string;
    inviteCode: string;
    fromStatus: string | null;
    toStatus: string;
    attemptCount: number;
    txId: string | null;
    errorMessage: string;
    recordedAt: string;
  }>;
};

type DbRecord = Record<string, unknown>;

function text(value: unknown): string {
  return String(value ?? '');
}

function optionalText(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized || null;
}

function integerText(value: unknown): string | null {
  const normalized = String(value ?? '');
  return /^\d+$/.test(normalized)
    ? BigInt(normalized).toString()
    : null;
}

function nonNegativeInteger(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isSafeInteger(parsed) && parsed >= 0
    ? parsed
    : 0;
}

function timestamp(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    Number.isNaN(Date.parse(value))
  ) {
    return null;
  }

  return value;
}

function requireTimestamp(value: unknown, label: string): string {
  const parsed = timestamp(value);
  if (!parsed) {
    throw new Error(`${label} is malformed.`);
  }
  return parsed;
}

function requireId(value: unknown, label: string): string {
  const parsed = integerText(value);
  if (!parsed || BigInt(parsed) < 1n) {
    throw new Error(`${label} is malformed.`);
  }
  return parsed;
}

function requireWei(value: unknown): string {
  const parsed = integerText(value);
  if (parsed === null) {
    throw new Error('Stored payout amount is malformed.');
  }
  return parsed;
}

async function readRowsForRoundIds(
  table: string,
  columns: string,
  roundIds: string[],
  orderColumn: string,
  limit: number,
): Promise<DbRecord[]> {
  if (roundIds.length < 1) {
    return [];
  }

  const { data, error } = await supabaseAdmin
    .from(table)
    .select(columns)
    .in('round_id', roundIds)
    .order(orderColumn, { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(
      `${table} could not be loaded for payout observability: ${error.message}`,
    );
  }

  return (data ?? []) as DbRecord[];
}

async function readActivePipelineDetails(
  activeRound: DbRecord | null,
) {
  if (!activeRound) {
    return {
      manifest: null,
      checkpoint: null,
      signedTransaction: null,
      submission: null,
      settlement: null,
      payouts: [] as DbRecord[],
    };
  }

  const roundId = requireId(activeRound.id, 'active reward round id');
  const [manifestResult, payoutResult] = await Promise.all([
    supabaseAdmin
      .from('reward_payout_manifests')
      .select('id, round_id, operator_wallet, manifest_hash, created_at')
      .eq('round_id', roundId)
      .maybeSingle(),
    supabaseAdmin
      .from('reward_payouts')
      .select('id, status, tx_id, error_message, attempt_count, updated_at')
      .eq('round_id', roundId)
      .order('id', { ascending: true }),
  ]);

  if (manifestResult.error) {
    throw new Error(
      `Active payout manifest could not be loaded: ${manifestResult.error.message}`,
    );
  }
  if (payoutResult.error) {
    throw new Error(
      `Active payouts could not be loaded: ${payoutResult.error.message}`,
    );
  }

  const manifest = manifestResult.data as DbRecord | null;
  if (!manifest) {
    return {
      manifest: null,
      checkpoint: null,
      signedTransaction: null,
      submission: null,
      settlement: null,
      payouts: (payoutResult.data ?? []) as DbRecord[],
    };
  }

  const manifestId = requireId(manifest.id, 'active payout manifest id');
  const [checkpointResult, signedResult, submissionResult, settlementResult] =
    await Promise.all([
      supabaseAdmin
        .from('reward_payout_manifest_chain_checkpoints')
        .select('manifest_id, block_number, recorded_at')
        .eq('manifest_id', manifestId)
        .maybeSingle(),
      supabaseAdmin
        .from('reward_payout_signed_transactions')
        .select('manifest_id, tx_id, operator_wallet, created_at')
        .eq('manifest_id', manifestId)
        .maybeSingle(),
      supabaseAdmin
        .from('reward_payout_transaction_submissions')
        .select('manifest_id, tx_id, operator_wallet, registered_at')
        .eq('manifest_id', manifestId)
        .maybeSingle(),
      supabaseAdmin
        .from('reward_payout_transaction_settlements')
        .select('id, manifest_id, tx_id, block_number, finalized_head_number, verified_at, paid_at')
        .eq('manifest_id', manifestId)
        .maybeSingle(),
    ]);

  for (const [label, result] of [
    ['checkpoint', checkpointResult],
    ['signed transaction', signedResult],
    ['submission', submissionResult],
    ['settlement', settlementResult],
  ] as const) {
    if (result.error) {
      throw new Error(
        `Active payout ${label} could not be loaded: ${result.error.message}`,
      );
    }
  }

  return {
    manifest,
    checkpoint: checkpointResult.data as DbRecord | null,
    signedTransaction: signedResult.data as DbRecord | null,
    submission: submissionResult.data as DbRecord | null,
    settlement: settlementResult.data as DbRecord | null,
    payouts: (payoutResult.data ?? []) as DbRecord[],
  };
}

function diagnosePipeline(input: {
  queuedCount: number;
  activeRound: DbRecord | null;
  details: Awaited<ReturnType<typeof readActivePipelineDetails>>;
}): {
  stage: RewardPayoutPipelineStage;
  diagnosis: string;
  latestError: string | null;
} {
  const latestError = input.details.payouts
    .map((row) => optionalText(row.error_message))
    .find((value): value is string => Boolean(value)) ?? null;

  if (latestError) {
    return {
      stage: 'ATTENTION_REQUIRED',
      diagnosis:
        '지급 레코드에 오류가 기록되어 있습니다. 아래 오류와 TX 상태를 확인하세요. / A payout error is recorded. Review the stored error and transaction state below.',
      latestError,
    };
  }

  if (!input.activeRound) {
    if (input.queuedCount > 0) {
      return {
        stage: 'QUEUED',
        diagnosis:
          '적격 보상이 대기열에 있으며 자동 지급 워커가 다음 배치를 준비할 수 있습니다. / Eligible rewards are queued and waiting for the automatic worker to prepare the next batch.',
        latestError: null,
      };
    }

    return {
      stage: 'IDLE',
      diagnosis:
        '현재 처리할 보상이 없습니다. / There are no rewards waiting to be processed.',
      latestError: null,
    };
  }

  if (text(input.activeRound.status) === 'PAYING') {
    return {
      stage: 'ATTENTION_REQUIRED',
      diagnosis:
        '레거시/수동 PAYING 라운드가 열려 있습니다. 자동 워커가 이 상태를 건너뜁니다. / A legacy/manual PAYING round is open and the automatic worker will not take it over.',
      latestError: null,
    };
  }

  const { details } = input;

  if (details.settlement) {
    return {
      stage: 'SETTLED',
      diagnosis:
        '온체인 finality 검증과 DB 정산이 완료되었습니다. / On-chain finality verification and database settlement are complete.',
      latestError: null,
    };
  }

  if (details.submission) {
    return {
      stage: 'WAITING_FINALITY',
      diagnosis:
        'TX가 제출되었고 VeChain finality 확인을 기다리고 있습니다. / The transaction was submitted and is waiting for VeChain finality.',
      latestError: null,
    };
  }

  if (details.signedTransaction) {
    return {
      stage: 'SIGNED',
      diagnosis:
        '동일 TX 재시도가 가능하도록 서명 TX가 안전하게 기록되었습니다. 제출/재전송을 기다립니다. / The signed transaction is journaled for idempotent recovery and is waiting for submission or rebroadcast.',
      latestError: null,
    };
  }

  if (details.checkpoint) {
    return {
      stage: 'CHECKPOINTED',
      diagnosis:
        '불변 체인 체크포인트가 생성되었고 서명 전 단계입니다. / The immutable chain checkpoint exists and the batch is ready for signing.',
      latestError: null,
    };
  }

  if (details.manifest) {
    return {
      stage: 'MANIFEST_CREATED',
      diagnosis:
        '불변 지급 manifest가 생성되었고 체인 체크포인트를 기다립니다. / The immutable payout manifest exists and is waiting for its chain checkpoint.',
      latestError: null,
    };
  }

  return {
    stage: 'ROUND_PREPARED',
    diagnosis:
      '지급 라운드가 준비되었고 manifest 생성을 기다립니다. / The reward round is prepared and waiting for manifest creation.',
    latestError: null,
  };
}

export async function readRewardPayoutObservability(
  limit = 30,
): Promise<RewardPayoutObservability> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
    throw new Error('Payout history limit must be between 1 and 50.');
  }

  const network = getVeBetterNetwork();
  const [roundResult, queueResult] = await Promise.all([
    supabaseAdmin
      .from('reward_rounds')
      .select('id, network, status, vebetter_round_id, created_at, started_at, completed_at')
      .eq('network', network)
      .order('id', { ascending: false })
      .limit(60),
    supabaseAdmin
      .from('reward_queue_entries')
      .select('id, queued_at', { count: 'exact' })
      .eq('network', network)
      .eq('status', 'QUEUED')
      .is('assigned_round_id', null)
      .order('queued_at', { ascending: true })
      .limit(1),
  ]);

  if (roundResult.error) {
    throw new Error(
      `Reward rounds could not be loaded for payout observability: ${roundResult.error.message}`,
    );
  }
  if (queueResult.error) {
    throw new Error(
      `Reward queue could not be loaded for payout observability: ${queueResult.error.message}`,
    );
  }

  const rounds = (roundResult.data ?? []) as DbRecord[];
  const roundIds = rounds
    .map((row) => integerText(row.id))
    .filter((value): value is string => Boolean(value));
  const roundMap = new Map(
    rounds.map((row) => [requireId(row.id, 'reward round id'), row]),
  );
  const activeRound =
    rounds.find((row) => ['CREATED', 'PAYING'].includes(text(row.status))) ?? null;

  const [payoutRows, settlementRows, receiptRows, failureRows, activeDetails] =
    await Promise.all([
      readRowsForRoundIds(
        'reward_payouts',
        'id, round_id, invite_code, recipient_wallet, amount_wei, status, tx_id, attempt_count, error_message, created_at, updated_at, paid_at',
        roundIds,
        'created_at',
        limit,
      ),
      supabaseAdmin
        .from('reward_payout_transaction_settlements')
        .select('id, round_id, network, tx_id, block_number, finalized_head_number, verified_at, paid_at')
        .eq('network', network)
        .order('paid_at', { ascending: false })
        .limit(60),
      supabaseAdmin
        .from('reward_receipts')
        .select('id, payout_id, round_id, network, tx_id, paid_at')
        .eq('network', network)
        .order('paid_at', { ascending: false })
        .limit(100),
      readRowsForRoundIds(
        'reward_payout_status_events',
        'id, payout_id, round_id, invite_code, from_status, to_status, attempt_count, tx_id, error_message, recorded_at',
        roundIds,
        'recorded_at',
        100,
      ),
      readActivePipelineDetails(activeRound),
    ]);

  for (const [label, result] of [
    ['settlements', settlementRows],
    ['receipts', receiptRows],
  ] as const) {
    if (result.error) {
      throw new Error(
        `Reward ${label} could not be loaded for payout observability: ${result.error.message}`,
      );
    }
  }

  const settlementByRound = new Map<string, DbRecord>();
  for (const row of (settlementRows.data ?? []) as DbRecord[]) {
    const roundId = integerText(row.round_id);
    if (roundId && !settlementByRound.has(roundId)) {
      settlementByRound.set(roundId, row);
    }
  }

  const receiptByPayout = new Map<string, DbRecord>();
  for (const row of (receiptRows.data ?? []) as DbRecord[]) {
    const payoutId = integerText(row.payout_id);
    if (payoutId && !receiptByPayout.has(payoutId)) {
      receiptByPayout.set(payoutId, row);
    }
  }

  const recentPayouts: RewardPayoutHistoryItem[] = payoutRows.map((row) => {
    const payoutId = requireId(row.id, 'payout id');
    const roundId = requireId(row.round_id, 'payout round id');
    const round = roundMap.get(roundId);
    const settlement = settlementByRound.get(roundId);
    const receipt = receiptByPayout.get(payoutId);

    return {
      payoutId,
      roundId,
      veBetterRoundId: round
        ? integerText(round.vebetter_round_id)
        : null,
      inviteCode: text(row.invite_code),
      recipientWallet: text(row.recipient_wallet).toLowerCase(),
      amountWei: requireWei(row.amount_wei),
      status: text(row.status),
      txId: optionalText(row.tx_id)?.toLowerCase() ?? null,
      attemptCount: nonNegativeInteger(row.attempt_count),
      errorMessage: optionalText(row.error_message),
      createdAt: requireTimestamp(row.created_at, 'payout created_at'),
      updatedAt: requireTimestamp(row.updated_at, 'payout updated_at'),
      paidAt: timestamp(row.paid_at),
      receiptId: receipt ? integerText(receipt.id) : null,
      settlementId: settlement ? integerText(settlement.id) : null,
      finalizedBlockNumber: settlement
        ? integerText(settlement.block_number)
        : null,
      finalizedHeadNumber: settlement
        ? integerText(settlement.finalized_head_number)
        : null,
      verifiedAt: settlement ? timestamp(settlement.verified_at) : null,
    };
  });

  const recentFailures = failureRows
    .filter((row) => optionalText(row.error_message))
    .slice(0, 20)
    .map((row) => ({
      eventId: requireId(row.id, 'payout status event id'),
      payoutId: requireId(row.payout_id, 'payout status event payout id'),
      roundId: requireId(row.round_id, 'payout status event round id'),
      inviteCode: text(row.invite_code),
      fromStatus: optionalText(row.from_status),
      toStatus: text(row.to_status),
      attemptCount: nonNegativeInteger(row.attempt_count),
      txId: optionalText(row.tx_id)?.toLowerCase() ?? null,
      errorMessage: optionalText(row.error_message) as string,
      recordedAt: requireTimestamp(row.recorded_at, 'payout status event timestamp'),
    }));

  const queuedCount = queueResult.count ?? 0;
  const oldestQueueRow = ((queueResult.data ?? []) as DbRecord[])[0] ?? null;
  const oldestQueuedAt = oldestQueueRow
    ? timestamp(oldestQueueRow.queued_at)
    : null;
  const diagnosed = diagnosePipeline({
    queuedCount,
    activeRound,
    details: activeDetails,
  });

  const paidPayouts = recentPayouts.filter(
    (payout) => payout.status === 'PAID',
  );
  const payoutsWithErrors = recentPayouts.filter(
    (payout) => Boolean(payout.errorMessage),
  );
  const pendingPayouts = recentPayouts.filter(
    (payout) => payout.status !== 'PAID',
  );
  const latestPaid = paidPayouts[0] ?? null;
  const activeRoundId = activeRound
    ? requireId(activeRound.id, 'active round id')
    : null;
  const activeManifestId = activeDetails.manifest
    ? requireId(activeDetails.manifest.id, 'active manifest id')
    : null;
  const activeTxId = optionalText(
    activeDetails.settlement?.tx_id ??
      activeDetails.submission?.tx_id ??
      activeDetails.signedTransaction?.tx_id,
  )?.toLowerCase() ?? null;

  return {
    capturedAt: new Date().toISOString(),
    network,
    pipeline: {
      stage: diagnosed.stage,
      diagnosis: diagnosed.diagnosis,
      queuedCount,
      oldestQueuedAt,
      roundId: activeRoundId,
      veBetterRoundId: activeRound
        ? integerText(activeRound.vebetter_round_id)
        : null,
      manifestId: activeManifestId,
      txId: activeTxId,
      latestError: diagnosed.latestError,
    },
    summary: {
      trackedPayouts: recentPayouts.length,
      paidPayouts: paidPayouts.length,
      pendingPayouts: pendingPayouts.length,
      payoutsWithErrors: payoutsWithErrors.length,
      latestPaidAt: latestPaid?.paidAt ?? null,
      latestPaidTxId: latestPaid?.txId ?? null,
    },
    recentPayouts,
    recentFailures,
  };
}
