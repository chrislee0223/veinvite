import {
  NextRequest,
  NextResponse,
} from 'next/server';
import { ThorClient } from '@vechain/sdk-network';

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

const CHECKPOINT_INTENT =
  'CREATE_MANIFEST_CHAIN_CHECKPOINT';
const POSITIVE_INTEGER_PATTERN = /^\d+$/;
const HEX_32_PATTERN = /^0x[0-9a-f]{64}$/;

function requestHasSameOrigin(
  request: NextRequest,
): boolean {
  const origin = request.headers.get('origin');

  if (!origin) {
    return false;
  }

  try {
    return new URL(origin).origin ===
      request.nextUrl.origin;
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
    !POSITIVE_INTEGER_PATTERN.test(normalized) ||
    BigInt(normalized) < 1n
  ) {
    throw new Error(
      `${fieldName} must be a positive integer.`,
    );
  }

  return BigInt(normalized).toString();
}

function readBlockIdentity(raw: unknown) {
  if (
    typeof raw !== 'object' ||
    raw === null ||
    !('id' in raw) ||
    !('number' in raw) ||
    !('timestamp' in raw)
  ) {
    throw new Error(
      'VeChain best block response is invalid.',
    );
  }

  const id = String(raw.id).toLowerCase();
  const number = Number(raw.number);
  const timestamp = Number(raw.timestamp);

  if (!HEX_32_PATTERN.test(id)) {
    throw new Error(
      'VeChain best block id is invalid.',
    );
  }

  if (
    !Number.isSafeInteger(number) ||
    number < 0 ||
    !Number.isSafeInteger(timestamp) ||
    timestamp < 0
  ) {
    throw new Error(
      'VeChain best block metadata is invalid.',
    );
  }

  return {
    blockId: id,
    blockNumber: number,
    blockTimestamp: timestamp,
  };
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
    body.intent !== CHECKPOINT_INTENT
  ) {
    return NextResponse.json(
      {
        error:
          `intent must be ${CHECKPOINT_INTENT}.`,
      },
      { status: 400 },
    );
  }

  let manifestId: string;

  try {
    manifestId = parsePositiveInteger(
      'manifestId' in body
        ? body.manifestId
        : null,
      'manifestId',
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Invalid manifestId.',
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
          'id, network, app_id, x2earn_rewards_pool_address, operator_wallet, manifest_hash, created_at',
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
            'The payout manifest does not match the reviewed VeBetterDAO reward configuration.',
        },
        {
          status: 409,
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    const existingResult =
      await supabaseAdmin
        .from(
          'reward_payout_manifest_chain_checkpoints',
        )
        .select(
          'manifest_id, block_id, block_number, block_timestamp, recorded_at',
        )
        .eq('manifest_id', manifestId)
        .maybeSingle();

    if (existingResult.error) {
      throw new Error(
        `Existing manifest checkpoint could not be checked: ${existingResult.error.message}`,
      );
    }

    if (existingResult.data) {
      return NextResponse.json(
        {
          checkpointCreated: false,
          manifestId,
          manifestHash:
            manifest.manifest_hash,
          checkpoint: existingResult.data,
          transactionSubmitted: false,
          transfersPerformed: false,
        },
        {
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    const { nodeUrl } =
      getVeBetterNetworkConfig();
    const thor = ThorClient.at(nodeUrl);
    const bestBlock =
      await thor.blocks
        .getBestBlockCompressed();

    if (!bestBlock) {
      throw new Error(
        'VeChain best block could not be loaded.',
      );
    }

    const checkpoint =
      readBlockIdentity(bestBlock);

    const { error: checkpointError } =
      await supabaseAdmin.rpc(
        'create_reward_payout_manifest_chain_checkpoint',
        {
          p_manifest_id: manifestId,
          p_block_id: checkpoint.blockId,
          p_block_number:
            checkpoint.blockNumber,
          p_block_timestamp:
            checkpoint.blockTimestamp,
        },
      );

    if (checkpointError) {
      throw new Error(
        `create_reward_payout_manifest_chain_checkpoint failed: ${checkpointError.message}`,
      );
    }

    const persistedResult =
      await supabaseAdmin
        .from(
          'reward_payout_manifest_chain_checkpoints',
        )
        .select(
          'manifest_id, block_id, block_number, block_timestamp, recorded_at',
        )
        .eq('manifest_id', manifestId)
        .single();

    if (persistedResult.error) {
      throw new Error(
        `Created manifest checkpoint could not be reloaded: ${persistedResult.error.message}`,
      );
    }

    if (
      persistedResult.data.block_id !==
        checkpoint.blockId ||
      Number(
        persistedResult.data.block_number,
      ) !== checkpoint.blockNumber ||
      Number(
        persistedResult.data.block_timestamp,
      ) !== checkpoint.blockTimestamp
    ) {
      throw new Error(
        'Persisted manifest checkpoint does not match the observed VeChain block.',
      );
    }

    return NextResponse.json(
      {
        checkpointCreated: true,
        manifestId,
        manifestHash:
          manifest.manifest_hash,
        checkpoint: persistedResult.data,
        rule:
          'The payout transaction must be included in a block strictly after this checkpoint.',
        transactionSubmitted: false,
        transfersPerformed: false,
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
      'Failed to create VeInvite payout manifest chain checkpoint:',
      error,
    );

    return NextResponse.json(
      {
        error:
          'VeInvite payout manifest chain checkpoint could not be created.',
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
