import { NextRequest, NextResponse } from 'next/server';

import {
  canUseNetworkPublicLayout,
  isNetworkCanaryWallet,
  readNetworkRuntimeMode,
} from '@/lib/networkRuntimeServer';
import {
  readPublishedNetworkLayout,
} from '@/lib/networkPublishedLayoutServer';
import type {
  PublishedNetworkLayoutSnapshot,
} from '@/lib/networkPublishedLayout';
import {
  enforceRateLimits,
  getClientIpSubject,
} from '@/lib/rateLimitServer';
import { normalizeAddress } from '@/lib/serverStore';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { requireWalletSession } from '@/lib/walletAuthServer';

type PublicNetworkRpcError =
  | 'PUBLIC_NETWORK_DISABLED'
  | 'INVALID_WALLET'
  | 'FOCUS_NOT_FOUND';

type PublicNetworkPayload = {
  error?: PublicNetworkRpcError;
  rootWallet?: string;
  focusWallet?: string;
  focusDepth?: number;
  breadcrumb?: string[];
  summary?: {
    network: number;
    direct: number;
    depth: number;
  };
  children?: Array<{
    wallet: string;
    network: number;
    direct: number;
    depth: number;
  }>;
  depthLimitReached?: boolean;
  availableSlots?: number;
  availableSlotIds?: Array<1 | 2>;
  slots?: PublicInviteSlotMetadata[];
  slotAvailabilityKnown?: boolean;
  publishedLayout?: PublishedNetworkLayoutSnapshot | null;
};

const PUBLIC_NETWORK_RPC_TIMEOUT_MS = 5_000;
const PUBLIC_SLOT_LOOKUP_TIMEOUT_MS = 1_500;

type PublicInviteSlotState = 'AVAILABLE' | 'PENDING' | 'IN_PROGRESS';

type PublicInviteSlotMetadata = {
  slot: 1 | 2;
  state: PublicInviteSlotState;
};

type PublicInviteSlotRow = {
  status: 'PENDING_ACCEPTANCE' | 'ACTIVATING' | 'UNDER_REVIEW' | 'COMPLETED';
  eligibility_check_id: string | number | null;
  activation_network: string | null;
  invitee_wallet: string | null;
  invite_slot: number;
  slot_released_at: string | null;
  sybil_status: 'NOT_CHECKED' | 'CLEAR' | 'REVIEW' | 'BLOCKED';
  created_at: string;
};

type PublicInviteSlotSnapshot = {
  slots: PublicInviteSlotMetadata[];
  occupiedInviteeWallets: Set<string>;
};

const PUBLIC_SLOT_ACTIVE_STATUSES: PublicInviteSlotRow['status'][] = [
  'PENDING_ACCEPTANCE',
  'ACTIVATING',
  'UNDER_REVIEW',
  'COMPLETED',
];

function publicSlotHasEntryProof(row: PublicInviteSlotRow): boolean {
  return row.eligibility_check_id !== null && Boolean(row.activation_network);
}

function publicSlotOccupies(row: PublicInviteSlotRow): boolean {
  if (row.sybil_status === 'BLOCKED') return false;
  if (row.status === 'PENDING_ACCEPTANCE') return true;
  if (row.status === 'ACTIVATING' || row.status === 'UNDER_REVIEW') {
    return publicSlotHasEntryProof(row);
  }
  return publicSlotHasEntryProof(row) && row.slot_released_at === null;
}

async function readPublicSlotSnapshot(wallet: string): Promise<PublicInviteSlotSnapshot | null> {
  // The canary mirrors the owner-slot fixture: slot 1 occupied, slot 2 free.
  if (await isNetworkCanaryWallet(wallet)) {
    return {
      slots: [
        { slot: 1, state: 'IN_PROGRESS' },
        { slot: 2, state: 'AVAILABLE' },
      ],
      occupiedInviteeWallets: new Set<string>(),
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PUBLIC_SLOT_LOOKUP_TIMEOUT_MS);
  try {
    const { data, error } = await supabaseAdmin
      .from('invitations')
      .select(
        'status, eligibility_check_id, activation_network, invitee_wallet, invite_slot, slot_released_at, sybil_status, created_at',
      )
      .eq('inviter_wallet', wallet)
      .in('status', PUBLIC_SLOT_ACTIVE_STATUSES)
      .order('created_at', { ascending: false })
      .abortSignal(controller.signal);

    if (error) {
      console.error('Failed to load public Network slot state:', error);
      return null;
    }

    const occupied = new Map<1 | 2, PublicInviteSlotRow>();
    for (const row of (data ?? []) as PublicInviteSlotRow[]) {
      if (!publicSlotOccupies(row)) continue;
      const slot = row.invite_slot === 2 ? 2 : 1;
      if (!occupied.has(slot)) occupied.set(slot, row);
    }

    const occupiedInviteeWallets = new Set<string>();
    for (const row of occupied.values()) {
      const inviteeWallet = row.invitee_wallet?.trim().toLowerCase() ?? '';
      if (/^0x[0-9a-f]{40}$/.test(inviteeWallet)) {
        occupiedInviteeWallets.add(inviteeWallet);
      }
    }

    const slots = ([1, 2] as const).map((slot): PublicInviteSlotMetadata => {
      const row = occupied.get(slot);
      if (!row) return { slot, state: 'AVAILABLE' };
      return {
        slot,
        state: row.status === 'PENDING_ACCEPTANCE' ? 'PENDING' : 'IN_PROGRESS',
      };
    });

    return {
      slots,
      occupiedInviteeWallets,
    };
  } catch (error) {
    if (!controller.signal.aborted) {
      console.error('Public Network slot state lookup failed:', error);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function noStoreJson(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function normalizeOptionalWallet(value: string | null): string | null {
  if (!value) return null;
  try {
    return normalizeAddress(value);
  } catch {
    return null;
  }
}

async function canCurrentViewerUsePublicNetwork(request: NextRequest): Promise<boolean> {
  const mode = await readNetworkRuntimeMode('public');
  if (mode === 'on') return true;
  if (mode === 'off') return false;

  // Canary is intentionally viewer-gated. A canary root must not become
  // guest-readable before the Public surface is fully enabled.
  try {
    const session = await requireWalletSession({ request });
    return isNetworkCanaryWallet(session.walletAddress);
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const walletParam = request.nextUrl.searchParams.get('wallet');
  if (!walletParam) {
    return noStoreJson({ code: 'WALLET_REQUIRED', error: 'wallet query parameter is required' }, 400);
  }

  let rootWallet: string;
  try {
    rootWallet = normalizeAddress(walletParam);
  } catch {
    return noStoreJson({ code: 'INVALID_WALLET', error: 'Invalid wallet address.' }, 400);
  }

  const focusParam = request.nextUrl.searchParams.get('focus');
  const focusWallet = focusParam
    ? normalizeOptionalWallet(focusParam)
    : rootWallet;

  if (!focusWallet) {
    return noStoreJson({ code: 'INVALID_FOCUS_WALLET', error: 'Invalid focus wallet address.' }, 400);
  }

  const ipSubject = getClientIpSubject(request);
  const rateLimitResponse = await enforceRateLimits([
    ipSubject
      ? {
          scope: 'network_public_ip',
          subject: ipSubject,
          limit: 60,
          windowSeconds: 60,
        }
      : null,
    {
      scope: 'network_public_target',
      subject: rootWallet,
      limit: 120,
      windowSeconds: 60,
    },
  ]);
  if (rateLimitResponse) return rateLimitResponse;

  if (!(await canCurrentViewerUsePublicNetwork(request))) {
    return noStoreJson(
      { code: 'PUBLIC_NETWORK_DISABLED', error: 'Public Network is temporarily unavailable.' },
      503,
    );
  }

  // Slot state belongs to whichever wallet is currently centered. Start it
  // beside the graph read so subnetwork navigation does not create a second
  // serial wait. Invitee identity is used only server-side to avoid rendering
  // the same in-progress referral twice; it never enters the browser payload.
  const slotSnapshotPromise = readPublicSlotSnapshot(focusWallet);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PUBLIC_NETWORK_RPC_TIMEOUT_MS);

  let rpcResult: Awaited<ReturnType<typeof supabaseAdmin.rpc>>;
  try {
    rpcResult = await supabaseAdmin
      .rpc('read_public_referral_network_focus_v1', {
        p_root_wallet: rootWallet,
        p_focus_wallet: focusWallet,
        p_round_id: null,
        p_round_start_at: null,
        p_round_end_at: null,
      })
      .abortSignal(controller.signal);
  } catch (error) {
    if (controller.signal.aborted) {
      return noStoreJson({ code: 'PUBLIC_NETWORK_TIMEOUT', error: 'Public Network took too long to load.' }, 503);
    }
    console.error('Failed to load Public Network:', error);
    return noStoreJson({ code: 'PUBLIC_NETWORK_LOAD_FAILED', error: 'Failed to load Public Network.' }, 500);
  } finally {
    clearTimeout(timer);
  }

  const { data, error } = rpcResult;
  if (error) {
    console.error('Public Network RPC failed:', error);
    return noStoreJson({ code: 'PUBLIC_NETWORK_LOAD_FAILED', error: 'Failed to load Public Network.' }, 500);
  }

  const payload = (data ?? {}) as PublicNetworkPayload;
  if (payload.error === 'PUBLIC_NETWORK_DISABLED') {
    return noStoreJson({ code: 'PUBLIC_NETWORK_DISABLED', error: 'Public Network is temporarily unavailable.' }, 503);
  }
  if (payload.error === 'FOCUS_NOT_FOUND') {
    return noStoreJson({ code: 'FOCUS_NOT_FOUND', error: 'That wallet is not part of this network.' }, 404);
  }
  if (payload.error === 'INVALID_WALLET') {
    return noStoreJson({ code: 'INVALID_WALLET', error: 'Invalid wallet address.' }, 400);
  }

  const slotSnapshot = await slotSnapshotPromise;
  payload.slotAvailabilityKnown = slotSnapshot !== null;
  const availableSlotIds = slotSnapshot
    ? slotSnapshot.slots
        .filter((slot) => slot.state === 'AVAILABLE')
        .map((slot) => slot.slot)
    : null;

  if (slotSnapshot) {
    payload.slots = slotSnapshot.slots;
    payload.availableSlotIds = availableSlotIds ?? [];
    payload.availableSlots = availableSlotIds?.length ?? 0;

    if (payload.children && slotSnapshot.occupiedInviteeWallets.size > 0) {
      payload.children = payload.children.filter(
        (child) =>
          !slotSnapshot.occupiedInviteeWallets.has(
            child.wallet.trim().toLowerCase(),
          ),
      );
    }
  }

  if (await canUseNetworkPublicLayout(rootWallet)) {
    try {
      payload.publishedLayout =
        await readPublishedNetworkLayout({
          rootWallet,
          focusWallet,
          allowedWallets: (payload.children ?? [])
            .map((child) => child.wallet),
          allowedSlotIds: slotSnapshot
            ? slotSnapshot.slots.map((slot) => slot.slot)
            : [],
        });
    } catch (error) {
      // Layout is optional display metadata. Never make the public graph fail
      // because its owner-authored arrangement could not be loaded.
      console.error(
        'Failed to load public Network owner layout:',
        error,
      );
    }
  }

  // This endpoint exposes referral-graph structure plus only anonymous slot
  // state needed to mirror the owner's two-slot layout. Mission progress,
  // reward, anti-Sybil detail, invitee identity, invitation detail, and signing
  // data never enter the browser payload.
  return noStoreJson(payload as Record<string, unknown>);
}
