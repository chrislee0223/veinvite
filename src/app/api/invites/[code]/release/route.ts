import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

import { INVITATION_EVIDENCE_LEASE_SECONDS } from '@/lib/impact/reconcileInvitationWithLease';
import { syncInvitationEvidence, type InvitationEvidenceRow } from '@/lib/impact/syncInvitation';

import { normalizeAddress } from '@/lib/serverStore';
import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  requireWalletSession,
  WalletAuthenticationError,
} from '@/lib/walletAuthServer';

const inviteCodePattern = /^[A-HJ-NP-Z2-9]{7}$/;

type ReleaseResult =
  | 'RELEASED'
  | 'ALREADY_RELEASED'
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'NOT_ALLOWED'
  | 'REWARD_LOCKED';

function reply(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

/**
 * Ends an unfinished, accepted permanent-link invitation without deleting
 * the referral relationship or modifying any Sybil or payout verdict.
 * The RPC locks the same inviter concurrency key as referral claiming.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  const normalizedCode = code.trim().toUpperCase();

  if (!inviteCodePattern.test(normalizedCode)) {
    return reply({ error: 'Invalid invite code.' }, 400);
  }

  let inviterAddress: string;
  try {
    const body: unknown = await request.json();
    const value =
      body && typeof body === 'object' && 'inviterAddress' in body
        ? (body as { inviterAddress?: unknown }).inviterAddress
        : null;
    if (typeof value !== 'string' ||
        !/^0x[0-9a-fA-F]{40}$/.test(value.trim())) {
      return reply({ error: 'Invalid inviter address.' }, 400);
    }
    inviterAddress = normalizeAddress(value.trim());
  } catch {
    return reply({ error: 'Invalid JSON body.' }, 400);
  }

  try {
    await requireWalletSession({
      request,
      expectedWallet: inviterAddress,
    });
  } catch (error) {
    if (error instanceof WalletAuthenticationError) {
      return reply({ error: error.message }, error.status);
    }
    console.error('Manual slot release wallet authentication failed:', error);
    return reply({ error: 'Wallet verification failed.' }, 500);
  }

  // Serialize with other on-chain evidence scans. A stale browser snapshot
  // must never enable release after the friend completed their final step.
  const lockName = `invite_evidence_sync:${normalizedCode}`;
  const ownerToken = randomUUID();
  const { data: acquired, error: leaseError } = await supabaseAdmin.rpc(
    'try_acquire_operator_lock',
    {
      p_lock_name: lockName,
      p_owner_token: ownerToken,
      p_lease_seconds: INVITATION_EVIDENCE_LEASE_SECONDS,
    },
  );
  if (leaseError) {
    console.error('Slot release sync lease unavailable:', leaseError);
    return reply({ error: 'Could not verify mission progress.' }, 503);
  }
  if (acquired !== true) {
    return reply({ error: 'Mission verification is in progress. Try again.' }, 409);
  }

  let result: ReleaseResult;
  try {
    const { data: invitation, error: readError } = await supabaseAdmin
      .from('invitations')
      .select('*')
      .eq('invite_code', normalizedCode)
      .eq('inviter_wallet', inviterAddress)
      .maybeSingle();

    if (readError) throw readError;
    if (!invitation) return reply({ error: 'Invitation not found.' }, 404);

    // Preserve idempotency without rescanning a terminal referral.
    if (invitation.status === 'CANCELLED' &&
        invitation.inviter_released_at) {
      return reply({ released: true, result: 'ALREADY_RELEASED' });
    }

    if (invitation.status !== 'ACTIVATING' ||
        !invitation.referral_link_id ||
        !invitation.invitee_wallet ||
        invitation.sybil_status === 'REVIEW' ||
        invitation.sybil_status === 'BLOCKED') {
      return reply({ error: 'This invitation cannot be released.' }, 409);
    }

    // Run the same authoritative on-chain evidence reconciliation as the
    // invite's existing verification endpoint while the lease is held.
    const synced = await syncInvitationEvidence(
      invitation as InvitationEvidenceRow,
    );
    if (synced.row.status !== 'ACTIVATING' ||
        synced.row.sybil_status === 'REVIEW' ||
        synced.row.sybil_status === 'BLOCKED') {
      return reply({ error: 'Mission or security verification is in progress.' }, 409);
    }

    // RPC performs the final row-level and reward/payout checks atomically.
    const { data, error } = await supabaseAdmin.rpc(
      'release_incomplete_referral_by_inviter',
      {
        p_invite_code: normalizedCode,
        p_inviter_wallet: inviterAddress,
      },
    );
    if (error) throw error;
    result = data as ReleaseResult;
  } catch (error) {
    console.error('Manual slot release verification failed:', error);
    return reply({ error: 'Could not verify or release this invitation.' }, 503);
  } finally {
    const { error: releaseError } = await supabaseAdmin.rpc(
      'release_operator_lock',
      {
        p_lock_name: lockName,
        p_owner_token: ownerToken,
      },
    );
    if (releaseError) {
      console.error('Manual slot release evidence lease cleanup failed:', releaseError);
    }
  }

  switch (result) {
    case 'RELEASED':
    case 'ALREADY_RELEASED':
      return reply({ released: true, result });
    case 'NOT_FOUND':
      return reply({ error: 'Invitation not found.' }, 404);
    case 'REWARD_LOCKED':
      return reply({ error: 'Reward processing has already started.' }, 409);
    case 'NOT_ALLOWED':
      return reply({
        error: 'This invitation cannot be released in its current state.',
      }, 409);
    case 'INVALID_INPUT':
      return reply({ error: 'Invalid invitation input.' }, 400);
    default:
      console.error('Unexpected slot release RPC result:', result);
      return reply({ error: 'Unexpected slot release result.' }, 500);
  }
}
