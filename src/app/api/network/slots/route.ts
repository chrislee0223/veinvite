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
  invitee_wallet: string | null;
  invite_slot: number;
  slot_released_at: string | null;
  sybil_status: 'NOT_CHECKED' | 'CLEAR' | 'REVIEW' | 'BLOCKED';
  apps_completed: number | null;
  vot3_converted: boolean | null;
  vote_completed: boolean | null;
  created_at: string;
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

function slotProgress(row: SlotRow) {
  const apps = Math.max(0, Math.min(3, row.apps_completed ?? 0));
  const completedSteps =
    apps +
    (row.vot3_converted ? 1 : 0) +
    (row.vote_completed ? 1 : 0);
  return {
    completedSteps,
    totalSteps: 5,
  };
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
      {
        availableSlots: 1,
        occupiedSlots: [1],
        slots: [
          {
            slot: 1,
            state: 'IN_PROGRESS',
            inviteeWallet: '0xca11ab1e000000000000000000000000000001f5',
            completedSteps: 3,
            totalSteps: 5,
          },
          {
            slot: 2,
            state: 'AVAILABLE',
            inviteeWallet: null,
            completedSteps: 0,
            totalSteps: 5,
          },
        ],
      },
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
      'status, eligibility_check_id, activation_network, invitee_wallet, invite_slot, slot_released_at, sybil_status, apps_completed, vot3_converted, vote_completed, created_at',
    )
    .eq('inviter_wallet', wallet)
    .in('status', ACTIVE_STATUSES)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to load Network invite slots:', error);
    return NextResponse.json(
      { error: 'Failed to load invite slots.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const occupied = new Map<1 | 2, SlotRow>();
  for (const row of (data ?? []) as SlotRow[]) {
    if (!occupiesInviteSlot(row)) continue;
    const slot = row.invite_slot === 2 ? 2 : 1;
    if (!occupied.has(slot)) occupied.set(slot, row);
  }

  const occupiedSlots = Array.from(occupied.keys()).sort((a, b) => a - b);
  const slots = ([1, 2] as const).map((slot) => {
    const row = occupied.get(slot);
    if (!row) {
      return {
        slot,
        state: 'AVAILABLE' as const,
        inviteeWallet: null,
        completedSteps: 0,
        totalSteps: 5,
      };
    }

    const progress = slotProgress(row);
    return {
      slot,
      state: row.invitee_wallet ? 'IN_PROGRESS' as const : 'PENDING' as const,
      inviteeWallet: row.invitee_wallet,
      ...progress,
    };
  });

  return NextResponse.json(
    {
      availableSlots: Math.max(0, 2 - occupiedSlots.length),
      occupiedSlots,
      slots,
    },
    {
      headers: {
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    },
  );
}
