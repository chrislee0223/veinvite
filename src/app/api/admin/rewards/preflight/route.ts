import {
  NextRequest,
  NextResponse,
} from 'next/server';
import { ThorClient } from '@vechain/sdk-network';

import {
  buildPayoutManifest,
} from '@/lib/rewards/payoutManifest';
import {
  canOperateVeInviteRewards,
  readVeInviteRewardPoolStatus,
} from '@/lib/rewards/onchainPool';
import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  getVeBetterNetworkConfig,
} from '@/lib/vebetter/network';
import {
  requireWalletSession,
  WalletAuthenticationError,
} from '@/lib/walletAuthServer';

const PREFLIGHT_INTENT =
  'PREFLIGHT_PAYOUT_TRANSACTION';
const POSITIVE_INTEGER_PATTERN = /^\d+$/;

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

async function fundedRewardsMayBeSigned(
  network: string,
): Promise<boolean> {
  if (network !== 'mainnet') {
    return true;
  }

  const { data, error } =
    await supabaseAdmin
      .from('reward_runtime_config')
      .select('mainnet_funded_rewards_enabled')
      .eq('id', 1)
      .maybeSingle();

  if (error) {
    throw new Error(
      `Funded reward runtime gate could not be loaded: ${error.message}`,
    );
  }

  return (
    data?.mainnet_funded_rewards_enabled ===
    true
  );
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
    body.intent !== PREFLIGHT_INTENT
  ) {
    return NextResponse.json(
      {
        error:
          `intent must be ${PREFLIGHT_INTENT}.`,
      },
      { status: 400 },
    );
  }

  let manifestId: string;

  try {
    manifestId = readManifestId(
      'manifestId' in body
        ? body.manifestId
        : null,
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Invalid payout preflight request.',
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

    if (
      !(await fundedRewardsMayBeSigned(
        pool.network,
      ))
    ) {
      return NextResponse.json(
        {
          readyToSign: false,
          code: 'FUNDED_REWARDS_DISABLED',
          error:
            'Mainnet funded rewards are disabled by the VeInvite runtime safety gate. Do not sign a payout transaction.',
          transactionSubmitted: false,
          transfersPerformed: false,
        },
        {
          status: 409,
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
          'id, round_id, network, app_id, x2earn_rewards_pool_address, operator_wallet, manifest_hash, payout_count, total_amount_wei, clauses, created_at',
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

    if (pool.distributionPaused) {
      return NextResponse.json(
        {
          readyToSign: false,
          code: 'DISTRIBUTION_PAUSED',
          error:
            'VeInvite reward distribution is paused on-chain.',
        },
        {
          status: 409,
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    if (
      BigInt(pool.effectiveRewardPoolWei) <
      BigInt(
        String(
          storedManifest.total_amount_wei,
        ),
      )
    ) {
      return NextResponse.json(
        {
          readyToSign: false,
          code: 'INSUFFICIENT_POOL_BALANCE',
          error:
            'The current VeBetterDAO reward pool balance is below the immutable payout total.',
          currentPoolBalanceWei:
            pool.effectiveRewardPoolWei,
          requiredWei:
            String(
              storedManifest.total_amount_wei,
            ),
        },
        {
          status: 409,
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    const [
      roundResult,
      payoutResult,
      checkpointResult,
      submissionResult,
      settlementResult,
    ] = await Promise.all([
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
      supabaseAdmin
        .from(
          'reward_payout_manifest_chain_checkpoints',
        )
        .select(
          'manifest_id, block_id, block_number, block_timestamp, recorded_at',
        )
        .eq('manifest_id', manifestId)
        .maybeSingle(),
      supabaseAdmin
        .from(
          'reward_payout_transaction_submissions',
        )
        .select('id, tx_id, registered_at')
        .eq('manifest_id', manifestId)
        .maybeSingle(),
      supabaseAdmin
        .from(
          'reward_payout_transaction_settlements',
        )
        .select('id, tx_id, paid_at')
        .eq('manifest_id', manifestId)
        .maybeSingle(),
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

    if (checkpointResult.error) {
      throw new Error(
        `Payout checkpoint could not be loaded: ${checkpointResult.error.message}`,
      );
    }

    if (submissionResult.error) {
      throw new Error(
        `Payout submission could not be loaded: ${submissionResult.error.message}`,
      );
    }

    if (settlementResult.error) {
      throw new Error(
        `Payout settlement could not be loaded: ${settlementResult.error.message}`,
      );
    }

    if (!checkpointResult.data) {
      return NextResponse.json(
        {
          readyToSign: false,
          code: 'CHECKPOINT_REQUIRED',
          error:
            'A chain checkpoint is required before payout signing.',
        },
        {
          status: 409,
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    if (settlementResult.data) {
      return NextResponse.json(
        {
          readyToSign: false,
          code: 'ALREADY_FINALIZED',
          error:
            'This payout manifest is already finalized.',
          settlement:
            settlementResult.data,
        },
        {
          status: 409,
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    if (submissionResult.data) {
      return NextResponse.json(
        {
          readyToSign: false,
          code: 'TRANSACTION_ALREADY_REGISTERED',
          error:
            'A payout transaction is already registered for this manifest. Verify that transaction instead of sending again.',
          submission:
            submissionResult.data,
        },
        {
          status: 409,
          headers: {
            'Cache-Control': 'no-store',
          },
        },
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
          readyToSign: false,
          code: 'MANIFEST_DRIFT',
          error:
            'The current reserved payouts do not reproduce the immutable payout manifest.',
        },
        {
          status: 409,
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    const { nodeUrl } =
      getVeBetterNetworkConfig();
    const thor = ThorClient.at(nodeUrl);
    const [gasResult, bestBlock] =
      await Promise.all([
        thor.gas.estimateGas(
          manifest.clauses,
          session.walletAddress,
        ),
        thor.blocks.getBestBlockCompressed(),
      ]);

    if (!bestBlock) {
      throw new Error(
        'VeChain best block could not be loaded for payout preflight.',
      );
    }

    const estimatedGas = Number(
      gasResult.totalGas,
    );
    const blockGasLimit = Number(
      (bestBlock as unknown as {
        gasLimit?: unknown;
      }).gasLimit,
    );

    if (
      !Number.isSafeInteger(estimatedGas) ||
      estimatedGas < 1
    ) {
      throw new Error(
        'VeChain payout gas estimate is invalid.',
      );
    }

    if (
      !Number.isSafeInteger(blockGasLimit) ||
      blockGasLimit < 1
    ) {
      throw new Error(
        'VeChain block gas limit is invalid.',
      );
    }

    const recommendedGasCeiling =
      Math.floor(blockGasLimit * 0.8);

    if (
      estimatedGas > recommendedGasCeiling
    ) {
      return NextResponse.json(
        {
          readyToSign: false,
          code: 'PAYOUT_BATCH_TOO_LARGE',
          error:
            'The payout batch is too large for the conservative VeInvite transaction gas ceiling. Do not sign this transaction.',
          estimatedGas,
          blockGasLimit,
          recommendedGasCeiling,
          payoutCount:
            manifest.payoutCount,
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
        readyToSign: true,
        manifestId,
        manifestHash:
          storedManifest.manifest_hash,
        payoutCount:
          manifest.payoutCount,
        totalAmountWei:
          manifest.totalAmountWei,
        estimatedGas,
        blockGasLimit,
        recommendedGasCeiling,
        currentPoolBalanceWei:
          pool.effectiveRewardPoolWei,
        checkpoint:
          checkpointResult.data,
        transactionSubmitted: false,
        transfersPerformed: false,
      },
      {
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
      'Failed to preflight VeInvite payout transaction:',
      error,
    );

    return NextResponse.json(
      {
        readyToSign: false,
        error:
          'VeInvite payout transaction preflight could not be completed.',
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
