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

export async function GET(
  request: NextRequest,
) {
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

    const [
      queueResult,
      activeRoundResult,
      completedRoundResult,
    ] = await Promise.all([
      supabaseAdmin
        .from('reward_queue_entries')
        .select('id', {
          count: 'exact',
          head: true,
        })
        .eq('network', pool.network)
        .eq('status', 'QUEUED'),
      supabaseAdmin
        .from('reward_rounds')
        .select(
          'id, network, app_id, status, observed_pool_balance_wei, reserved_before_round_wei, distributable_wei, eligible_count, per_reward_wei, remainder_wei, created_at, started_at, completed_at',
        )
        .eq('network', pool.network)
        .eq('app_id', pool.appId)
        .eq('status', 'CREATED')
        .order('id', {
          ascending: false,
        })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from('reward_rounds')
        .select(
          'id, network, app_id, status, distributable_wei, eligible_count, created_at, completed_at',
        )
        .eq('network', pool.network)
        .eq('app_id', pool.appId)
        .eq('status', 'COMPLETED')
        .order('id', {
          ascending: false,
        })
        .limit(1)
        .maybeSingle(),
    ]);

    if (queueResult.error) {
      throw new Error(
        `Reward queue could not be counted: ${queueResult.error.message}`,
      );
    }

    if (activeRoundResult.error) {
      throw new Error(
        `Active reward round could not be loaded: ${activeRoundResult.error.message}`,
      );
    }

    if (completedRoundResult.error) {
      throw new Error(
        `Latest completed reward round could not be loaded: ${completedRoundResult.error.message}`,
      );
    }

    const activeRound =
      activeRoundResult.data;

    if (!activeRound) {
      return NextResponse.json(
        {
          pool,
          verifiedOperator:
            session.walletAddress,
          queuedCount:
            queueResult.count ?? 0,
          activeRound: null,
          payouts: [],
          manifest: null,
          checkpoint: null,
          submission: null,
          settlement: null,
          latestCompletedRound:
            completedRoundResult.data,
          writesPerformed: false,
          transfersPerformed: false,
        },
        {
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    const payoutResult =
      await supabaseAdmin
        .from('reward_payouts')
        .select(
          'id, invite_code, recipient_wallet, amount_wei, status, tx_id, paid_at',
        )
        .eq(
          'round_id',
          String(activeRound.id),
        )
        .order('id', {
          ascending: true,
        });

    if (payoutResult.error) {
      throw new Error(
        `Active reward payouts could not be loaded: ${payoutResult.error.message}`,
      );
    }

    const manifestResult =
      await supabaseAdmin
        .from('reward_payout_manifests')
        .select(
          'id, round_id, manifest_version, network, app_id, x2earn_rewards_pool_address, operator_wallet, manifest_hash, payout_count, total_amount_wei, clauses, created_at',
        )
        .eq(
          'round_id',
          String(activeRound.id),
        )
        .maybeSingle();

    if (manifestResult.error) {
      throw new Error(
        `Reward payout manifest could not be loaded: ${manifestResult.error.message}`,
      );
    }

    const manifest = manifestResult.data;
    let checkpoint = null;
    let submission = null;
    let settlement = null;

    if (manifest) {
      const [
        checkpointResult,
        submissionResult,
        settlementResult,
      ] = await Promise.all([
        supabaseAdmin
          .from(
            'reward_payout_manifest_chain_checkpoints',
          )
          .select(
            'manifest_id, block_id, block_number, block_timestamp, recorded_at',
          )
          .eq(
            'manifest_id',
            String(manifest.id),
          )
          .maybeSingle(),
        supabaseAdmin
          .from(
            'reward_payout_transaction_submissions',
          )
          .select(
            'id, manifest_id, round_id, network, manifest_hash, tx_id, operator_wallet, registered_at',
          )
          .eq(
            'manifest_id',
            String(manifest.id),
          )
          .maybeSingle(),
        supabaseAdmin
          .from(
            'reward_payout_transaction_settlements',
          )
          .select(
            'id, manifest_id, round_id, network, manifest_hash, tx_id, tx_origin, block_id, block_number, block_timestamp, finalized_head_id, finalized_head_number, clause_count, verified_at, paid_at',
          )
          .eq(
            'manifest_id',
            String(manifest.id),
          )
          .maybeSingle(),
      ]);

      if (checkpointResult.error) {
        throw new Error(
          `Reward payout checkpoint could not be loaded: ${checkpointResult.error.message}`,
        );
      }

      if (submissionResult.error) {
        throw new Error(
          `Reward payout submission could not be loaded: ${submissionResult.error.message}`,
        );
      }

      if (settlementResult.error) {
        throw new Error(
          `Reward payout settlement could not be loaded: ${settlementResult.error.message}`,
        );
      }

      checkpoint = checkpointResult.data;
      submission = submissionResult.data;
      settlement = settlementResult.data;
    }

    return NextResponse.json(
      {
        pool,
        verifiedOperator:
          session.walletAddress,
        queuedCount:
          queueResult.count ?? 0,
        activeRound,
        payouts:
          payoutResult.data ?? [],
        manifest,
        checkpoint,
        submission,
        settlement,
        latestCompletedRound:
          completedRoundResult.data,
        writesPerformed: false,
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
      'Failed to load VeInvite reward admin overview:',
      error,
    );

    return NextResponse.json(
      {
        error:
          'VeInvite reward admin overview could not be loaded.',
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
