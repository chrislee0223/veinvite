import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  getVeBetterNetworkConfig,
} from '@/lib/vebetter/network';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (
    process.env.VERCEL_ENV ===
    'production'
  ) {
    return new NextResponse(null, {
      status: 404,
    });
  }

  const { network } =
    getVeBetterNetworkConfig();

  const [queueResult, eligibleResult] =
    await Promise.all([
      supabaseAdmin
        .from('reward_queue_entries')
        .select('invite_code')
        .eq('network', network)
        .eq('status', 'QUEUED')
        .is('assigned_round_id', null),
      supabaseAdmin
        .from('invitations')
        .select('invite_code')
        .eq('activation_network', network)
        .eq('status', 'COMPLETED')
        .eq('reward_status', 'ELIGIBLE')
        .not('eligibility_check_id', 'is', null),
    ]);

  if (queueResult.error) {
    return NextResponse.json(
      {
        error:
          `Queue read failed: ${queueResult.error.message}`,
      },
      { status: 500 },
    );
  }

  if (eligibleResult.error) {
    return NextResponse.json(
      {
        error:
          `Eligibility read failed: ${eligibleResult.error.message}`,
      },
      { status: 500 },
    );
  }

  const queueCodes = new Set(
    (queueResult.data ?? []).map(
      (row) => row.invite_code,
    ),
  );
  const eligibleCodes = new Set(
    (eligibleResult.data ?? []).map(
      (row) => row.invite_code,
    ),
  );

  const missingFromQueue =
    [...eligibleCodes].filter(
      (code) => !queueCodes.has(code),
    ).length;
  const unexpectedInQueue =
    [...queueCodes].filter(
      (code) => !eligibleCodes.has(code),
    ).length;

  return NextResponse.json(
    {
      mode: 'READ_ONLY_QUEUE_SELF_AUDIT',
      writesPerformed: false,
      transfersPerformed: false,
      network,
      queueReadable: true,
      queuedCount: queueCodes.size,
      eligibleInvitationCount:
        eligibleCodes.size,
      missingFromQueue,
      unexpectedInQueue,
      consistent:
        missingFromQueue === 0 &&
        unexpectedInQueue === 0,
    },
    {
      headers: {
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex',
      },
    },
  );
}
