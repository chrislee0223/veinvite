import { NextRequest, NextResponse } from 'next/server';

import {
  canUseNetworkSurface,
  isNetworkCanaryWallet,
} from '@/lib/networkRuntimeServer';
import { enforceRateLimits } from '@/lib/rateLimitServer';
import { normalizeAddress } from '@/lib/serverStore';
import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  requireWalletSession,
  WalletAuthenticationError,
} from '@/lib/walletAuthServer';

type SlotRow = {
  status: 'PENDING_ACCEPTANCE' | 'ACTIVATING' | 'UNDER_REVIEW' | 'COMPLETED' | 'CANCELLED';
  eligibility_check_id: string | number | null;
  activation_network: string | null;
  invite_slot: number;
  slot_released_at: string | null;
  sybil_status: 'NOT_CHECKED' | 'CLEAR' | 'REVIEW' | 'BLOCKED';
};

const ACTIVE_STATUSES: SlotRow['status'][] = [
  'PENDING_ACCEPTANCE',
  'ACTIVATING',
  'UNDER_REVIEW',
  'COMPLETED',
];

function authErrorResponse(error: unknown): NextResponse | null {
  if (!(error instanceof WalletAuthenticationError)) return null;
  return NextResponse.json(
    { error: error.message },
    { status: error.status, headers: { 'Cache-Control': 'no-store' } },
  );
}

function hasEntryProof(row: SlotRow): boolean {
  return row.eligibility_check_id !== null && Boolean(row.activation_network);
}

function occupiesInviteSlot(row: SlotRow): boolean {
  if (row.sybil_status === 'BLOCKED') return false;
  if (row.status === 'PENDING_ACCEPTANCE') return true;
  if (row.status === 'ACTIVATING' || row.status === 'UNDER_REVIEW') {
    return hasEntryProof(row);
  }
  if (row.status === 'COMPLETED') {
    return hasEntryProof(row) && row.slot_released_at === null;
  }
  return false;
}

export async function GET(request: NextRequest) {
  const walletParam = request.nextUrl.searchParams.get('wallet');
  if (!walletParam) {
    return NextResponse.json(
      { error: 'wallet query parameter is required' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  let wallet: string;
  try {
    wallet = normalizeAddress(walletParam);
  } catch {
    return NextResponse.json(
      { error: 'Invalid wallet address.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    await requireWalletSession({ request, expectedWallet: wallet });
  } catch (error) {
    const response = authErrorResponse(error);
    if (response) return response;
    return NextResponse.json(
      { error: 'Failed to validate wallet verification.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const rateLimitResponse = await enforceRateLimits([
    {
      scope: 'network_slots_wallet',
      subject: wallet,
      limit: 90,
      windowSeconds: 60,
    },
  ]);
  if (rateLimitResponse) return rateLimitResponse;

  if (!(await canUseNetworkSurface('my', wallet))) {
    return NextResponse.json(
      { error: 'Network is temporarily unavailable.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  // The canary graph represents lifetime referral history. Keep one current
  // slot occupied and one available so the test wallet can exercise both the
  // historical branches and the Available-slot interaction at the same time.
  if (await isNetworkCanaryWallet(wallet)) {
    return NextResponse.json(
      { availableSlots: 1, occupiedSlots: [1] },
      {
        headers: {
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      },
    );
  }

  const { data, error } = await supabaseAdmin
    .from('invitations')
    .select(
      'status, eligibility_check_id, activation_network, invite_slot, slot_released_at, sybil_status',
    )
    .eq('inviter_wallet', wallet)
    .in('status', ACTIVE_STATUSES);

  if (error) {
    console.error('Failed to load Network invite slots:', error);
    return NextResponse.json(
      { error: 'Failed to load invite slots.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const occupied = new Set<1 | 2>();
  for (const row of (data ?? []) as SlotRow[]) {
    if (!occupiesInviteSlot(row)) continue;
    occupied.add(row.invite_slot === 2 ? 2 : 1);
  }

  const occupiedSlots = Array.from(occupied).sort((a, b) => a - b);
  return NextResponse.json(
    {
      availableSlots: Math.max(0, 2 - occupiedSlots.length),
      occupiedSlots,
    },
    {
      headers: {
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    },
  );
}
