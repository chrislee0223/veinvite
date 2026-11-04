import { NextRequest, NextResponse } from 'next/server';

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

  const { data, error } = await supabaseAdmin.rpc(
    'release_incomplete_referral_by_inviter',
    {
      p_invite_code: normalizedCode,
      p_inviter_wallet: inviterAddress,
    },
  );
  if (error) {
    console.error('Manual slot release RPC failed:', error);
    return reply({ error: 'Could not release this invitation.' }, 500);
  }

  const result = data as ReleaseResult;
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
