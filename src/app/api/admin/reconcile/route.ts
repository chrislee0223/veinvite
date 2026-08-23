import { timingSafeEqual } from 'crypto';

import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  syncInvitationEvidence,
  type InvitationEvidenceRow,
} from '@/lib/impact/syncInvitation';
import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  getVeBetterNetworkConfig,
} from '@/lib/vebetter/network';

const DEFAULT_BATCH_SIZE = 10;
const MAX_BATCH_SIZE = 25;

const invitationEvidenceColumns = `
  invite_code,
  inviter_wallet,
  invitee_wallet,
  status,
  reward_status,
  created_at,
  updated_at,
  activated_at,
  activation_block,
  activation_network,
  apps_completed,
  rewards_received,
  vote_completed,
  apps_completed_at,
  apps_completed_block,
  vote_completed_at,
  vote_completed_block,
  vote_round_id,
  sybil_status,
  sybil_risk_level,
  sybil_risk_score,
  sybil_reason,
  sybil_checked_at,
  sybil_source,
  impact_last_synced_block,
  impact_last_synced_at,
  impact_sync_complete_at
` as const;

function secureEquals(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}

function authorize(request: NextRequest) {
  const configured =
    process.env.VEINVITE_RECONCILE_SECRET;

  if (!configured) {
    return {
      ok: false as const,
      status: 503,
      error:
        'Reconciliation secret is not configured.',
    };
  }

  const provided =
    request.headers.get('x-veinvite-admin-secret');

  if (
    !provided ||
    !secureEquals(provided, configured)
  ) {
    return {
      ok: false as const,
      status: 401,
      error: 'Unauthorized.',
    };
  }

  return { ok: true as const };
}

function readBatchSize(body: unknown): number {
  if (
    typeof body !== 'object' ||
    body === null ||
    !('limit' in body) ||
    body.limit === undefined
  ) {
    return DEFAULT_BATCH_SIZE;
  }

  if (
    typeof body.limit !== 'number' ||
    !Number.isSafeInteger(body.limit) ||
    body.limit < 1 ||
    body.limit > MAX_BATCH_SIZE
  ) {
    throw new Error(
      `limit must be an integer from 1 to ${MAX_BATCH_SIZE}.`,
    );
  }

  return body.limit;
}

/**
 * Reconciles incomplete accepted referrals against VeChain truth without
 * depending on a user reopening the VeInvite UI.
 *
 * This endpoint does not prepare reward rounds and cannot transfer B3TR.
 * It is intentionally a small, serialized batch. A scheduler can call it
 * later after load/runtime behavior has been validated in Preview.
 */
export async function POST(
  request: NextRequest,
) {
  const authorization = authorize(request);

  if (!authorization.ok) {
    return NextResponse.json(
      { error: authorization.error },
      {
        status: authorization.status,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  let body: unknown = {};

  try {
    const text = await request.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body.' },
      {
        status: 400,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  let limit: number;

  try {
    limit = readBatchSize(body);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Invalid reconciliation limit.',
      },
      {
        status: 400,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  const { network } =
    getVeBetterNetworkConfig();

  // Completed raw-evidence rows need no further mission reconciliation.
  // Oldest/never-synced rows go first so a repeatedly invoked batch cannot
  // starve older referrals behind newly active users.
  const { data, error } = await supabaseAdmin
    .from('invitations')
    .select(invitationEvidenceColumns)
    .eq('activation_network', network)
    .not('invitee_wallet', 'is', null)
    .not('eligibility_check_id', 'is', null)
    .neq('status', 'CANCELLED')
    .is('impact_sync_complete_at', null)
    .order('impact_last_synced_at', {
      ascending: true,
      nullsFirst: true,
    })
    .order('activated_at', {
      ascending: true,
      nullsFirst: true,
    })
    .limit(limit);

  if (error) {
    console.error(
      'Failed to load reconciliation batch:',
      error,
    );

    return NextResponse.json(
      {
        error:
          'Failed to load reconciliation batch.',
      },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  const rows =
    (data ?? []) as InvitationEvidenceRow[];

  const results: Array<{
    inviteCode: string;
    status: string;
    rewardStatus: string;
    appsCompleted: number;
    voteCompleted: boolean;
    impactCheckpointSaved: boolean;
    impactSyncComplete: boolean;
    networkMismatch: boolean;
    error?: string;
  }> = [];

  for (const row of rows) {
    try {
      const synced =
        await syncInvitationEvidence(row);

      results.push({
        inviteCode: row.invite_code,
        status: synced.row.status,
        rewardStatus:
          synced.row.reward_status,
        appsCompleted:
          synced.progress.appsCompleted,
        voteCompleted:
          synced.progress.voteCompleted,
        impactCheckpointSaved:
          synced.progress
            .impactCheckpointSaved,
        impactSyncComplete:
          Boolean(
            synced.progress
              .impactSyncCompleteAt,
          ),
        networkMismatch:
          synced.progress.networkMismatch,
      });
    } catch (syncError) {
      console.error(
        `Unexpected reconciliation failure for ${row.invite_code}:`,
        syncError,
      );

      results.push({
        inviteCode: row.invite_code,
        status: row.status,
        rewardStatus: row.reward_status,
        appsCompleted:
          row.apps_completed ?? 0,
        voteCompleted:
          row.vote_completed ?? false,
        impactCheckpointSaved: false,
        impactSyncComplete: false,
        networkMismatch: false,
        error:
          syncError instanceof Error
            ? syncError.message
            : 'Unexpected reconciliation failure.',
      });
    }
  }

  const completed = results.filter(
    (result) =>
      result.impactSyncComplete,
  ).length;
  const failedOrIncomplete =
    results.length - completed;

  return NextResponse.json(
    {
      mode: 'CHAIN_RECONCILIATION',
      network,
      writesLimitedToEvidenceAndDerivedInvitationState:
        true,
      rewardRoundsPrepared: false,
      transfersPerformed: false,
      selected: rows.length,
      completed,
      failedOrIncomplete,
      results,
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}
