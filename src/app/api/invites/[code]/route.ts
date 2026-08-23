import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  syncInvitationEvidence,
  type InvitationEvidenceRow,
} from '@/lib/impact/syncInvitation';
import { supabaseAdmin } from '@/lib/supabaseServer';
import type {
  InviteRecord,
} from '@/lib/types';

const invitationColumns = `
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

function toInvitationRow(
  value: unknown,
): InvitationEvidenceRow | null {
  if (
    value === null ||
    typeof value !== 'object'
  ) {
    return null;
  }

  return value as InvitationEvidenceRow;
}

function toInviteRecord(
  row: InvitationEvidenceRow,
): InviteRecord {
  return {
    code: row.invite_code,
    inviterAddress:
      row.inviter_wallet,
    ...(row.invitee_wallet
      ? {
          inviteeAddress:
            row.invitee_wallet,
        }
      : {}),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    rewardEligibility:
      row.reward_status,
  };
}

export async function GET(
  _request: NextRequest,
  context: {
    params: Promise<{
      code: string;
    }>;
  },
) {
  const { code } =
    await context.params;

  const normalizedCode =
    code.trim().toUpperCase();

  const {
    data,
    error,
  } = await supabaseAdmin
    .from('invitations')
    .select(invitationColumns)
    .eq(
      'invite_code',
      normalizedCode,
    )
    .maybeSingle();

  if (error) {
    console.error(
      'Failed to load invitation:',
      error,
    );

    return NextResponse.json(
      {
        error:
          'Failed to load invitation.',
      },
      { status: 500 },
    );
  }

  const row =
    toInvitationRow(data);

  if (
    !row ||
    row.status === 'CANCELLED'
  ) {
    return NextResponse.json(
      {
        error:
          'Invite link is invalid or cancelled.',
      },
      { status: 404 },
    );
  }

  try {
    const synced =
      await syncInvitationEvidence(
        row,
      );

    return NextResponse.json(
      {
        invite:
          toInviteRecord(
            synced.row,
          ),
        progress:
          synced.progress,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (syncError) {
    console.error(
      'Failed to reconcile invitation evidence:',
      syncError,
    );

    // Do not pretend stale or partially reconciled data is current. The
    // invitation remains intact and can be retried without consuming any
    // additional invite or reward state.
    return NextResponse.json(
      {
        error:
          'Invitation activity could not be verified right now. Please try again.',
      },
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }
}
