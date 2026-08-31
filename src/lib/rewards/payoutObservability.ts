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

type Row = Record<string, unknown>;

type ActiveDetails = {
  manifest: Row | null;
  checkpoint: Row | null;
  signedTransaction: Row | null;
  submission: Row | null;
  settlement: Row | null;
  payouts: Row[];
};

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

function count(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isSafeInteger(parsed) && parsed >= 0
    ? parsed
    : 0;
}

async function readActiveDetails(
  activeRound: Row | null,
): Promise<ActiveDetails> {
  if (!activeRound) {
    return {
      manifest: null,
      checkpoint: null,
      signedTransaction: null,
      submission: null,
      settlement: null,
      payouts: [],
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

  const manifest = manifestResult.data as unknown as Row | null;
  const payouts = (payoutResult.data ?? []) as unknown as Row[];

  if (!manifest) {
    return {
      manifest: null,
      checkpoint: null,
      signedTransaction: null,
      submission: null,
      settlement: null,
      payouts,
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

  if (checkpointResult.error) {
    throw new Error(`Active payout checkpoint could not be loaded: ${checkpointResult.error.message}`);
  }
  if (signedResult.error) {
    throw new Error(`Active signed payout transaction could not be loaded: ${signedResult.error.message}`);
  }
  if (submissionResult.error) {
    throw new Error(`Active payout submission could not be loaded: ${submissionResult.error.message}`);
  }
  if (settlementResult.error) {
    throw new Error(`Active payout settlement could not be loaded: ${settlementResult.error.message}`);
  }

  return {
    manifest,
    checkpoint: checkpointResult.data as unknown as Row | null,
    signedTransaction: signedResult.data as unknown as Row | null,
    submission: submissionResult.data as unknown as Row | null,
    settlement: settlementResult.data as unknown as Row | null,
    payouts,
  };
}

function diagnose(
  queuedCount: number,
  activeRound: Row | null,
  details: ActiveDetails,
) {
  const latestError = details.payouts
    .map((row) => optionalText(row.error_message))
    .find((value): value is string => Boolean(value)) ?? null;

  if (latestError) {
    return {
      stage: 'ATTENTION_REQUIRED' as const,
      diagnosis:
        '지급 레코드에 오류가 기록되어 있습니다. 아래 오류와 TX 상태를 확인하세요. / A payout error is recorded. Review the stored error and transaction state below.',
      latestError,
    };
  }

  if (!activeRound) {
    return queuedCount > 0
      ? {
          stage: 'QUEUED' as const,
          diagnosis:
            '적격 보상이 대기열에 있으며 자동 지급 워커가 다음 배치를 준비할 수 있습니다. / Eligible rewards are queued for the automatic payout worker.',
          latestError: null,
        }
      : {
          stage: 'IDLE' as const,
          diagnosis:
            '현재 처리할 보상이 없습니다. / There are no rewards waiting to be processed.',
          latestError: null,
        };
  }

  if (text(activeRound.status) === 'PAYING') {
    return {
      stage: 'ATTENTION_REQUIRED' as const,
      diagnosis:
        '레거시/수동 PAYING 라운드가 열려 있습니다. 자동 워커가 이 상태를 건너뜁니다. / A legacy/manual PAYING round is open and requires operator review.',
      latestError: null,
    };
  }

  if (details.settlement) {
    return {
      stage: 'SETTLED' as const,
      diagnosis:
        '온체인 finality 검증과 DB 정산이 완료되었습니다. / On-chain finality verification and database settlement are complete.',
      latestError: null,
    };
  }
  if (details.submission) {
    return {
      stage: 'WAITING_FINALITY' as const,
      diagnosis:
        'TX가 제출되었고 VeChain finality 확인을 기다리고 있습니다. / The transaction is waiting for VeChain finality.',
      latestError: null,
    };
  }
  if (details.signedTransaction) {
    return {
      stage: 'SIGNED' as const,
      diagnosis:
        '서명 TX가 안전하게 기록되었고 제출 또는 동일 TX 재전송을 기다립니다. / The signed transaction is journaled and waiting for submission or rebroadcast.',
      latestError: null,
    };
  }
  if (details.checkpoint) {
    return {
      stage: 'CHECKPOINTED' as const,
      diagnosis:
        '불변 체인 체크포인트가 생성되었고 서명 전 단계입니다. / The immutable checkpoint exists and the batch is ready for signing.',
      latestError: null,
    };
  }
  if (details.manifest) {
    return {
      stage: 'MANIFEST_CREATED' as const,
      diagnosis:
        '불변 지급 manifest가 생성되었고 체인 체크포인트를 기다립니다. / The immutable payout manifest is waiting for its chain checkpoint.',
      latestError: null,
    };
  }

  return {
    stage: 'ROUND_PREPARED' as const,
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
  const [roundResult, queueResult, settlementResult, receiptResult] =
    await Promise.all([
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
    ]);

  if (roundResult.error) {
    throw new Error(`Reward rounds could not be loaded: ${roundResult.error.message}`);
  }
  if (queueResult.error) {
    throw new Error(`Reward queue could not be loaded: ${queueResult.error.message}`);
  }
  if (settlementResult.error) {
    throw new Error(`Reward settlements could not be loaded: ${settlementResult.error.message}`);
  }
  if (receiptResult.error) {
    throw new Error(`Reward receipts could not be loaded: ${receiptResult.error.message}`);
  }

  const rounds = (roundResult.data ?? []) as unknown as Row[];
  const roundIds = rounds
    .map((row) => integerText(row.id))
    .filter((value): value is string => Boolean(value));
  const roundMap = new Map(
    rounds.map((row) => [requireId(row.id, 'reward round id'), row]),
  );
  const activeRound =
    rounds.find((row) => ['CREATED', 'PAYING'].includes(text(row.status))) ?? null;

  let payoutRows: Row[] = [];
  let failureRows: Row[] = [];

  if (roundIds.length > 0) {
    const [payoutResult, failureResult] = await Promise.all([
      supabaseAdmin
        .from('reward_payouts')
        .select('id, round_id, invite_code, recipient_wallet, amount_wei, status, tx_id, attempt_count, error_message, created_at, updated_at, paid_at')
        .in('round_id', roundIds)
        .order('created_at', { ascending: false })
        .limit(limit),
      supabaseAdmin
        .from('reward_payout_status_events')
        .select('id, payout_id, round_id, invite_code, from_status, to_status, attempt_count, tx_id, error_message, recorded_at')
        .in('round_id', roundIds)
        .not('error_message', 'is', null)
        .order('recorded_at', { ascending: false })
        .limit(20),
    ]);

    if (payoutResult.error) {
      throw new Error(`Reward payouts could not be loaded: ${payoutResult.error.message}`);
    }
    if (failureResult.error) {
      throw new Error(`Reward payout failures could not be loaded: ${failureResult.error.message}`);
    }

    payoutRows = (payoutResult.data ?? []) as unknown as Row[];
    failureRows = (failureResult.data ?? []) as unknown as Row[];
  }

  const settlements = (settlementResult.data ?? []) as unknown as Row[];
  const receipts = (receiptResult.data ?? []) as unknown as Row[];
  const settlementByRound = new Map<string, Row>();
  for (const row of settlements) {
    const id = integerText(row.round_id);
    if (id && !settlementByRound.has(id)) {
      settlementByRound.set(id, row);
    }
  }
  const receiptByPayout = new Map<string, Row>();
  for (const row of receipts) {
    const id = integerText(row.payout_id);
    if (id && !receiptByPayout.has(id)) {
      receiptByPayout.set(id, row);
    }
  }

  const recentPayouts = payoutRows.map((row): RewardPayoutHistoryItem => {
    const payoutId = requireId(row.id, 'payout id');
    const roundId = requireId(row.round_id, 'payout round id');
    const round = roundMap.get(roundId);
    const settlement = settlementByRound.get(roundId);
    const receipt = receiptByPayout.get(payoutId);

    return {
      payoutId,
      roundId,
      veBetterRoundId: round ? integerText(round.vebetter_round_id) : null,
      inviteCode: text(row.invite_code),
      recipientWallet: text(row.recipient_wallet).toLowerCase(),
      amountWei: requireWei(row.amount_wei),
      status: text(row.status),
      txId: optionalText(row.tx_id)?.toLowerCase() ?? null,
      attemptCount: count(row.attempt_count),
      errorMessage: optionalText(row.error_message),
      createdAt: requireTimestamp(row.created_at, 'payout created_at'),
      updatedAt: requireTimestamp(row.updated_at, 'payout updated_at'),
      paidAt: timestamp(row.paid_at),
      receiptId: receipt ? integerText(receipt.id) : null,
      settlementId: settlement ? integerText(settlement.id) : null,
      finalizedBlockNumber: settlement ? integerText(settlement.block_number) : null,
      finalizedHeadNumber: settlement ? integerText(settlement.finalized_head_number) : null,
      verifiedAt: settlement ? timestamp(settlement.verified_at) : null,
    };
  });

  const recentFailures = failureRows.map((row) => ({
    eventId: requireId(row.id, 'payout status event id'),
    payoutId: requireId(row.payout_id, 'payout status event payout id'),
    roundId: requireId(row.round_id, 'payout status event round id'),
    inviteCode: text(row.invite_code),
    fromStatus: optionalText(row.from_status),
    toStatus: text(row.to_status),
    attemptCount: count(row.attempt_count),
    txId: optionalText(row.tx_id)?.toLowerCase() ?? null,
    errorMessage: optionalText(row.error_message) ?? 'Unknown payout error.',
    recordedAt: requireTimestamp(row.recorded_at, 'payout status event timestamp'),
  }));

  const activeDetails = await readActiveDetails(activeRound);
  const queuedCount = queueResult.count ?? 0;
  const oldestQueue = ((queueResult.data ?? []) as unknown as Row[])[0] ?? null;
  const diagnosed = diagnose(queuedCount, activeRound, activeDetails);
  const paid = recentPayouts.filter((item) => item.status === 'PAID');
  const pending = recentPayouts.filter((item) => item.status !== 'PAID');
  const withErrors = recentPayouts.filter((item) => Boolean(item.errorMessage));
  const latestPaid = paid[0] ?? null;
  const txId = optionalText(
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
      oldestQueuedAt: oldestQueue ? timestamp(oldestQueue.queued_at) : null,
      roundId: activeRound ? requireId(activeRound.id, 'active reward round id') : null,
      veBetterRoundId: activeRound ? integerText(activeRound.vebetter_round_id) : null,
      manifestId: activeDetails.manifest
        ? requireId(activeDetails.manifest.id, 'active payout manifest id')
        : null,
      txId,
      latestError: diagnosed.latestError,
    },
    summary: {
      trackedPayouts: recentPayouts.length,
      paidPayouts: paid.length,
      pendingPayouts: pending.length,
      payoutsWithErrors: withErrors.length,
      latestPaidAt: latestPaid?.paidAt ?? null,
      latestPaidTxId: latestPaid?.txId ?? null,
    },
    recentPayouts,
    recentFailures,
  };
}
