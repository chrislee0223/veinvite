import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  buildPayoutManifest,
} from '@/lib/rewards/payoutManifest';
import {
  canOperateVeInviteRewards,
  readVeInviteRewardPoolStatus,
} from '@/lib/rewards/onchainPool';
import {
  RewardTransactionVerificationError,
  verifyFinalizedRewardTransactionOnChain,
} from '@/lib/rewards/transactionVerification';
import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  requireWalletSession,
  WalletAuthenticationError,
} from '@/lib/walletAuthServer';

const VERIFY_INTENT =
  'VERIFY_PAYOUT_TRANSACTION';
const POSITIVE_INTEGER_PATTERN = /^\d+$/;
const TX_ID_PATTERN = /^0x[0-9a-fA-F]{64}$/;

function requestHasSameOrigin(
  request: NextRequest,
): boolean {
  const origin = request.headers.get('origin');

  if (!origin) {
    return false;
  }

  try {
    return (
      new URL(origin).origin ===
      request.nextUrl.origin
    );
  } catch {
    return false;
  }
}

function parsePositiveInteger(
  value: unknown,
  fieldName: string,
): string {
  const normalized = String(value ?? '');

  if (
    !POSITIVE_INTEGER_PATTERN.test(
      normalized,
    ) ||
    BigInt(normalized) < 1n
  ) {
    throw new Error(
      `${fieldName} must be a positive integer.`,
    );
  }

  return BigInt(normalized).toString();
}

function parseTxId(
  value: unknown,
): string {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();

  if (!TX_ID_PATTERN.test(normalized)) {
    throw new Error(
      'txId must be a 32-byte transaction id.',
    );
  }

  return normalized;
}

function verificationStatus(
  code: RewardTransactionVerificationError['code'],
): number {
  switch (code) {
    case 'TX_NOT_FOUND':
    case 'TX_RECEIPT_NOT_FOUND':
    case 'TX_NOT_FINALIZED':
      return 409;
    default:
      return 422;
  }
}

export async function POST(
  request: NextRequest,
) {
  if (!requestHasSameOrigin(request)) {
    return NextResponse.json(
      { error: 'Invalid request origin.' },
      {
        status: 403,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body.' },
      { status: 400 },
    );
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    !('intent' in body) ||
    body.intent !== VERIFY_INTENT
  ) {
    return NextResponse.json(
      {
        error:
          `intent must be ${VERIFY_INTENT}.`,
      },
      { status: 400 },
    );
  }

  let manifestId: string;
  let txId: string;

  try {
    manifestId = parsePositiveInteger(
      'manifestId' in body
        ? body.manifestId
        : null,
      'manifestId',
    );
    txId = parseTxId(
      'txId' in body
        ? body.txId
        : null,
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Invalid payout transaction verification request.',
      },
      { status: 400 },
    );
  }

  try {
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
      return NextResponse.json(
        {
          error:
            'The verified wallet is not the VeInvite reward operator.',
        },
        {
          status: 403,
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    const settlementResult =
      await supabaseAdmin
        .from(
          'reward_payout_transaction_settlements',
        )
        .select(
          'id, manifest_id, round_id, manifest_hash, tx_id, tx_origin, block_id, block_number, block_timestamp, finalized_head_id, finalized_head_number, clause_count, verified_at, paid_at',
        )
        .eq('manifest_id', manifestId)
        .maybeSingle();

    if (settlementResult.error) {
      throw new Error(
        `Existing payout settlement could not be checked: ${settlementResult.error.message}`,
      );
    }

    if (settlementResult.data) {
      if (
        settlementResult.data.tx_id !== txId
      ) {
        return NextResponse.json(
          {
            error:
              'This payout manifest is already finalized with a different transaction.',
            code:
              'MANIFEST_ALREADY_FINALIZED',
            settlement:
              settlementResult.data,
            transfersPerformedByThisRequest:
              false,
          },
          {
            status: 409,
            headers: {
              'Cache-Control': 'no-store',
            },
          },
        );
      }

      return NextResponse.json(
        {
          verified: true,
          alreadyFinalized: true,
          settlement:
            settlementResult.data,
          transactionSubmittedByThisRequest:
            false,
          transfersPerformedByThisRequest:
            false,
        },
        {
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    const manifestResult =
      await supabaseAdmin
        .from('reward_payout_manifests')
        .select(
          'id, round_id, manifest_version, network, app_id, x2earn_rewards_pool_address, operator_wallet, manifest_hash, payout_count, total_amount_wei, clauses, created_at',
        )
        .eq('id', manifestId)
        .single();

    if (manifestResult.error) {
      return NextResponse.json(
        {
          error:
            'Reward payout manifest was not found.',
        },
        {
          status: 404,
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    const storedManifest =
      manifestResult.data;

    if (
      storedManifest.operator_wallet !==
        session.walletAddress.toLowerCase()
    ) {
      return NextResponse.json(
        {
          error:
            'The verified wallet does not match the payout manifest operator.',
        },
        {
          status: 403,
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    if (
      storedManifest.network !== pool.network ||
      storedManifest.app_id !== pool.appId ||
      storedManifest.x2earn_rewards_pool_address !==
        pool.x2EarnRewardsPoolAddress.toLowerCase()
    ) {
      return NextResponse.json(
        {
          error:
            'The immutable payout manifest no longer matches the reviewed VeBetterDAO reward configuration.',
        },
        {
          status: 409,
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    const [roundResult, payoutResult] =
      await Promise.all([
        supabaseAdmin
          .from('reward_rounds')
          .select(
            'id, network, app_id, status, distributable_wei, eligible_count',
          )
          .eq(
            'id',
            String(storedManifest.round_id),
          )
          .single(),
        supabaseAdmin
          .from('reward_payouts')
          .select(
            'id, invite_code, recipient_wallet, amount_wei, status, tx_id',
          )
          .eq(
            'round_id',
            String(storedManifest.round_id),
          )
          .order('id', {
            ascending: true,
          }),
      ]);

    if (roundResult.error) {
      throw new Error(
        `Reward round could not be loaded: ${roundResult.error.message}`,
      );
    }

    if (payoutResult.error) {
      throw new Error(
        `Reward payouts could not be loaded: ${payoutResult.error.message}`,
      );
    }

    const manifest = buildPayoutManifest({
      round: roundResult.data,
      payouts: payoutResult.data ?? [],
      x2EarnRewardsPoolAddress:
        storedManifest
          .x2earn_rewards_pool_address,
    });

    if (
      manifest.manifestHash !==
        storedManifest.manifest_hash ||
      manifest.payoutCount !==
        storedManifest.payout_count ||
      manifest.totalAmountWei !==
        String(storedManifest.total_amount_wei)
    ) {
      return NextResponse.json(
        {
          error:
            'The current reserved payouts do not reproduce the immutable payout manifest.',
          code: 'MANIFEST_DRIFT',
        },
        {
          status: 409,
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    let verified;

    try {
      verified =
        await verifyFinalizedRewardTransactionOnChain({
          txId,
          manifest,
          operatorWallet:
            storedManifest.operator_wallet,
          manifestCreatedAt:
            storedManifest.created_at,
        });
    } catch (error) {
      if (
        error instanceof
          RewardTransactionVerificationError
      ) {
        return NextResponse.json(
          {
            verified: false,
            code: error.code,
            error: error.message,
            writesPerformed: false,
            transactionSubmittedByThisRequest:
              false,
            transfersPerformedByThisRequest:
              false,
          },
          {
            status: verificationStatus(
              error.code,
            ),
            headers: {
              'Cache-Control': 'no-store',
            },
          },
        );
      }

      throw error;
    }

    const { data, error } =
      await supabaseAdmin.rpc(
        'finalize_reward_payout_manifest',
        {
          p_manifest_id:
            BigInt(manifestId).toString(),
          p_manifest_hash:
            storedManifest.manifest_hash,
          p_tx_id: verified.txId,
          p_tx_origin:
            verified.txOrigin,
          p_block_id:
            verified.blockId,
          p_block_number:
            verified.blockNumber,
          p_block_timestamp:
            verified.blockTimestamp,
          p_finalized_head_id:
            verified.finalizedHeadId,
          p_finalized_head_number:
            verified.finalizedHeadNumber,
          p_clause_count:
            verified.clauseCount,
        },
      );

    if (error) {
      throw new Error(
        `finalize_reward_payout_manifest failed: ${error.message}`,
      );
    }

    return NextResponse.json(
      {
        verified: true,
        alreadyFinalized: false,
        manifestId,
        manifestHash:
          storedManifest.manifest_hash,
        verifiedTransaction: verified,
        settlement: data,
        databaseFinalized: true,
        transactionSubmittedByThisRequest:
          false,
        transfersPerformedByThisRequest:
          false,
      },
      {
        status: 201,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error) {
    if (
      error instanceof WalletAuthenticationError
    ) {
      return NextResponse.json(
        { error: error.message },
        {
          status: error.status,
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    console.error(
      'Failed to verify VeInvite payout transaction:',
      error,
    );

    return NextResponse.json(
      {
        error:
          'VeInvite payout transaction could not be verified.',
      },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }
}
