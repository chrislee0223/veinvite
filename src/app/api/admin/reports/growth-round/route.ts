import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  canOperateVeInviteRewards,
  readVeInviteRewardPoolStatus,
} from '@/lib/rewards/onchainPool';
import {
  finalizeRoundGrowthSnapshot,
  loadRoundGrowthReportingConfig,
} from '@/lib/reporting/roundGrowthSnapshots';
import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  requireWalletSession,
  WalletAuthenticationError,
} from '@/lib/walletAuthServer';
import {
  readVeBetterRoundWindow,
  VeBetterRoundInputError,
} from '@/lib/vebetter/entryEligibility';

export const dynamic = 'force-dynamic';

const SNAPSHOT_COLUMNS =
  'id, network, round_id, round_start_at, round_end_at, round_start_block, round_end_block, version, reporting_start_at, activated_new_users, activated_returning_users, cumulative_activated_new_users, cumulative_activated_returning_users, verified_new_users, verified_returning_users, flagged_new_users, active_existing_rejected_users, active_existing_rejection_attempts, source_checked_through_block, metrics_hash, metric_version, revision_reason, finalized_by, operator_wallet, created_at';

type RequestBody = {
  action?: unknown;
  roundId?: unknown;
  revisionReason?: unknown;
  note?: unknown;
};

function positiveRoundId(
  value: unknown,
): number | null {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' &&
          /^[1-9]\d*$/.test(value)
        ? Number(value)
        : Number.NaN;

  return Number.isSafeInteger(parsed) && parsed > 0
    ? parsed
    : null;
}

function optionalText(
  value: unknown,
  maxLength: number,
): string | null | undefined {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();

  if (
    normalized.length === 0 ||
    normalized.length > maxLength
  ) {
    return undefined;
  }

  return normalized;
}

async function requireOperator(
  request: NextRequest,
) {
  const session =
    await requireWalletSession({ request });
  const pool =
    await readVeInviteRewardPoolStatus();

  if (
    !canOperateVeInviteRewards(
      session.walletAddress,
      pool,
    )
  ) {
    throw new WalletAuthenticationError(
      'The verified wallet is not the VeInvite reward operator.',
      403,
    );
  }

  return { session, pool };
}

function errorCode(message: string) {
  const knownCodes = [
    'REPORTING_BASELINE_REQUIRED',
    'REPORTING_BASELINE_ALREADY_LOCKED',
    'REPORTING_BASELINE_IS_IMMUTABLE',
    'ROUND_PREDATES_REPORTING_BASELINE',
    'REPORTING_ROUND_NOT_COMPLETED',
    'REVISION_REASON_REQUIRED',
  ];

  return knownCodes.find((code) =>
    message.includes(code),
  );
}

export async function GET(request: NextRequest) {
  const rawRoundId =
    request.nextUrl.searchParams.get('roundId');
  const roundId =
    rawRoundId === null
      ? null
      : positiveRoundId(rawRoundId);

  if (rawRoundId !== null && roundId === null) {
    return NextResponse.json(
      { error: 'roundId must be a positive integer.' },
      {
        status: 400,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }

  try {
    const { session, pool } =
      await requireOperator(request);
    const config =
      await loadRoundGrowthReportingConfig();

    let query = supabaseAdmin
      .from(
        roundId === null
          ? 'operator_latest_round_growth_report_snapshots'
          : 'operator_round_growth_report_snapshots',
      )
      .select(SNAPSHOT_COLUMNS)
      .eq('network', pool.network)
      .order('round_id', { ascending: false })
      .order('version', { ascending: false })
      .limit(roundId === null ? 52 : 100);

    if (roundId !== null) {
      query = query.eq('round_id', roundId);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(
        `Round growth snapshots could not be loaded: ${error.message}`,
      );
    }

    return NextResponse.json(
      {
        network: pool.network,
        verifiedOperator:
          session.walletAddress,
        reporting: config,
        snapshots: data ?? [],
        revisionHistory:
          roundId !== null,
        writesPerformed: false,
      },
      {
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  } catch (error) {
    if (error instanceof WalletAuthenticationError) {
      return NextResponse.json(
        { error: error.message },
        {
          status: error.status,
          headers: { 'Cache-Control': 'no-store' },
        },
      );
    }

    console.error(
      'Failed to load round growth reports:',
      error,
    );

    return NextResponse.json(
      { error: 'Round growth reports could not be loaded.' },
      {
        status: 500,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
}

export async function POST(request: NextRequest) {
  let body: RequestBody;

  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json(
      { error: 'A valid JSON body is required.' },
      {
        status: 400,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }

  const action =
    typeof body.action === 'string'
      ? body.action.trim().toUpperCase()
      : '';
  const roundId = positiveRoundId(body.roundId);
  const revisionReason = optionalText(
    body.revisionReason,
    500,
  );
  const note = optionalText(body.note, 500);

  if (
    !['LOCK_BASELINE', 'FINALIZE'].includes(action) ||
    roundId === null ||
    revisionReason === undefined ||
    note === undefined
  ) {
    return NextResponse.json(
      {
        error:
          'action must be LOCK_BASELINE or FINALIZE, roundId must be positive, and text fields must be 1-500 characters when supplied.',
      },
      {
        status: 400,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }

  try {
    const { session, pool } =
      await requireOperator(request);
    const round = await readVeBetterRoundWindow({
      roundId,
    });

    if (round.network !== pool.network) {
      throw new Error(
        'Reporting round network does not match the reward pool network.',
      );
    }

    if (action === 'LOCK_BASELINE') {
      if (round.status === 'UPCOMING') {
        return NextResponse.json(
          {
            error:
              'The reporting baseline cannot begin in a future round.',
          },
          {
            status: 409,
            headers: {
              'Cache-Control': 'no-store',
            },
          },
        );
      }

      const { data, error } =
        await supabaseAdmin.rpc(
          'lock_operator_reporting_baseline',
          {
            p_network: pool.network,
            p_reporting_start_at:
              round.roundStartAt,
            p_reporting_round_id:
              round.roundId,
            p_operator_wallet:
              session.walletAddress,
            p_note: note,
          },
        );

      if (error) {
        throw new Error(
          `Reporting baseline could not be locked: ${error.message}`,
        );
      }

      return NextResponse.json(
        {
          action,
          baseline: data,
          round,
          writesPerformed: true,
          transfersPerformed: false,
        },
        {
          status: 201,
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    const snapshotId =
      await finalizeRoundGrowthSnapshot({
        network: pool.network,
        round,
        checkedThroughBlock: round.bestBlock,
        revisionReason,
        operatorWallet:
          session.walletAddress,
      });
    const { data: snapshot, error: snapshotError } =
      await supabaseAdmin
        .from(
          'operator_round_growth_report_snapshots',
        )
        .select(SNAPSHOT_COLUMNS)
        .eq('id', snapshotId)
        .single();

    if (snapshotError) {
      throw new Error(
        `Finalized growth snapshot could not be reloaded: ${snapshotError.message}`,
      );
    }

    return NextResponse.json(
      {
        action,
        snapshot,
        writesPerformed: true,
        transfersPerformed: false,
      },
      {
        status: 201,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  } catch (error) {
    if (
      error instanceof WalletAuthenticationError ||
      error instanceof VeBetterRoundInputError
    ) {
      return NextResponse.json(
        { error: error.message },
        {
          status:
            error instanceof WalletAuthenticationError
              ? error.status
              : 400,
          headers: { 'Cache-Control': 'no-store' },
        },
      );
    }

    const message =
      error instanceof Error
        ? error.message
        : 'Round growth report operation failed.';
    const code = errorCode(message);

    console.error(
      'Round growth report operation failed:',
      error,
    );

    return NextResponse.json(
      {
        error: message,
        ...(code ? { code } : {}),
      },
      {
        status: code ? 409 : 500,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
}
