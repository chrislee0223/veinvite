import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  canOperateVeInviteRewards,
  readVeInviteRewardPoolStatus,
} from '@/lib/rewards/onchainPool';
import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  requireWalletSession,
  WalletAuthenticationError,
} from '@/lib/walletAuthServer';

const REGISTER_INTENT =
  'REGISTER_PAYOUT_TRANSACTION';
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

function readManifestId(
  value: unknown,
): string {
  const normalized = String(value ?? '');

  if (
    !POSITIVE_INTEGER_PATTERN.test(normalized) ||
    BigInt(normalized) < 1n
  ) {
    throw new Error(
      'manifestId must be a positive integer.',
    );
  }

  return BigInt(normalized).toString();
}

function readTxId(value: unknown): string {
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
    body.intent !== REGISTER_INTENT
  ) {
    return NextResponse.json(
      {
        error:
          `intent must be ${REGISTER_INTENT}.`,
      },
      { status: 400 },
    );
  }

  let manifestId: string;
  let txId: string;

  try {
    manifestId = readManifestId(
      'manifestId' in body
        ? body.manifestId
        : null,
    );
    txId = readTxId(
      'txId' in body ? body.txId : null,
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Invalid payout transaction registration request.',
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

    const manifestResult =
      await supabaseAdmin
        .from('reward_payout_manifests')
        .select(
          'id, round_id, network, app_id, x2earn_rewards_pool_address, operator_wallet, manifest_hash',
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

    const manifest = manifestResult.data;

    if (
      manifest.operator_wallet !==
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
      manifest.network !== pool.network ||
      manifest.app_id !== pool.appId ||
      manifest.x2earn_rewards_pool_address !==
        pool.x2EarnRewardsPoolAddress.toLowerCase()
    ) {
      return NextResponse.json(
        {
          error:
            'The payout manifest no longer matches the reviewed VeBetterDAO reward configuration.',
        },
        {
          status: 409,
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    const checkpointResult =
      await supabaseAdmin
        .from(
          'reward_payout_manifest_chain_checkpoints',
        )
        .select(
          'manifest_id, block_id, block_number, block_timestamp, recorded_at',
        )
        .eq('manifest_id', manifestId)
        .maybeSingle();

    if (checkpointResult.error) {
      throw new Error(
        `Payout checkpoint could not be checked: ${checkpointResult.error.message}`,
      );
    }

    if (!checkpointResult.data) {
      return NextResponse.json(
        {
          error:
            'A chain checkpoint is required before registering a payout transaction.',
          code: 'CHECKPOINT_REQUIRED',
        },
        {
          status: 409,
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
        .select('id, tx_id, paid_at')
        .eq('manifest_id', manifestId)
        .maybeSingle();

    if (settlementResult.error) {
      throw new Error(
        `Existing payout settlement could not be checked: ${settlementResult.error.message}`,
      );
    }

    if (settlementResult.data) {
      if (
        settlementResult.data.tx_id === txId
      ) {
        return NextResponse.json(
          {
            registered: true,
            alreadyFinalized: true,
            txId,
            settlement:
              settlementResult.data,
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

      return NextResponse.json(
        {
          error:
            'This payout manifest is already finalized with a different transaction.',
          code:
            'MANIFEST_ALREADY_FINALIZED',
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
        'register_reward_payout_transaction_submission',
        {
          p_manifest_id: manifestId,
          p_tx_id: txId,
          p_operator_wallet:
            session.walletAddress,
        },
      );

    if (error) {
      throw new Error(
        `register_reward_payout_transaction_submission failed: ${error.message}`,
      );
    }

    return NextResponse.json(
      {
        registered: true,
        manifestId,
        manifestHash:
          manifest.manifest_hash,
        txId,
        submission: data,
        databasePaid: false,
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
      'Failed to register VeInvite payout transaction:',
      error,
    );

    return NextResponse.json(
      {
        error:
          'VeInvite payout transaction could not be registered.',
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
