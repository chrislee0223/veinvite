import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  canOperateVeInviteRewards,
  readVeInviteRewardPoolStatus,
} from '@/lib/rewards/onchainPool';
import {
  buildVeBetterRoundReportPosts,
  normalizeVeBetterRoundReport,
} from '@/lib/reporting/veBetterRoundReport';
import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  requireWalletSession,
  WalletAuthenticationError,
} from '@/lib/walletAuthServer';

function parseRoundId(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error('veBetterRoundId must be a positive integer.');
  }

  return BigInt(value).toString();
}

function reportErrorStatus(message: string): {
  status: number;
  code?: string;
} {
  if (message.includes('REPORTING_BASELINE_REQUIRED')) {
    return { status: 409, code: 'REPORTING_BASELINE_REQUIRED' };
  }

  if (message.includes('ROUND_PREDATES_REPORTING_BASELINE')) {
    return { status: 409, code: 'ROUND_PREDATES_REPORTING_BASELINE' };
  }

  if (message.includes('VEBETTER_ALLOCATION_NOT_FOUND')) {
    return { status: 404, code: 'VEBETTER_ALLOCATION_NOT_FOUND' };
  }

  return { status: 500 };
}

export async function GET(request: NextRequest) {
  let requestedRoundId: string | null;

  try {
    requestedRoundId = parseRoundId(
      request.nextUrl.searchParams.get('veBetterRoundId'),
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Invalid VeBetter round report request.',
      },
      {
        status: 400,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }

  try {
    const session = await requireWalletSession({ request });
    const pool = await readVeInviteRewardPoolStatus();

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
          headers: { 'Cache-Control': 'no-store' },
        },
      );
    }

    let veBetterRoundId = requestedRoundId;

    if (!veBetterRoundId) {
      const latestAllocation = await supabaseAdmin
        .from('vebetter_round_allocations')
        .select('vebetter_round_id')
        .eq('network', pool.network)
        .eq('app_id', pool.appId)
        .order('vebetter_round_id', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestAllocation.error) {
        throw new Error(
          `Latest VeBetter allocation could not be loaded: ${latestAllocation.error.message}`,
        );
      }

      if (!latestAllocation.data) {
        return NextResponse.json(
          {
            error:
              'No VeBetterDAO allocation receipt has been recorded for VeInvite yet.',
            code: 'NO_VEBETTER_ALLOCATION_RECEIPT',
          },
          {
            status: 404,
            headers: { 'Cache-Control': 'no-store' },
          },
        );
      }

      veBetterRoundId = String(
        latestAllocation.data.vebetter_round_id,
      );
    }

    const { data, error } = await supabaseAdmin.rpc(
      'get_veinvite_vebetter_round_report',
      {
        p_network: pool.network,
        p_app_id: pool.appId,
        p_vebetter_round_id: veBetterRoundId,
      },
    );

    if (error) {
      const mapped = reportErrorStatus(error.message);

      if (mapped.status !== 500) {
        return NextResponse.json(
          {
            error: error.message,
            ...(mapped.code ? { code: mapped.code } : {}),
            veBetterRoundId,
          },
          {
            status: mapped.status,
            headers: { 'Cache-Control': 'no-store' },
          },
        );
      }

      throw new Error(
        `VeBetter round report RPC failed: ${error.message}`,
      );
    }

    const report = normalizeVeBetterRoundReport(data);
    const posts = buildVeBetterRoundReportPosts(report);

    return NextResponse.json(
      {
        report,
        posts,
        verifiedOperator: session.walletAddress,
        writesPerformed: false,
        transfersPerformed: false,
      },
      {
        status: 200,
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
      'Failed to build VeInvite VeBetter round report:',
      error,
    );

    return NextResponse.json(
      {
        error: 'VeInvite VeBetter round report could not be generated.',
      },
      {
        status: 500,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
}
