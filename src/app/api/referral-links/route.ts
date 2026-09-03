import { NextRequest, NextResponse } from 'next/server';

import { enforceRateLimits } from '@/lib/rateLimitServer';
import {
  clampAvailableSlots,
  createReferralKey,
  PERMANENT_REFERRAL_SLOT_LIMIT,
} from '@/lib/referralLinks';
import { normalizeAddress } from '@/lib/serverStore';
import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  requireWalletSession,
  WalletAuthenticationError,
} from '@/lib/walletAuthServer';

type ReferralLinkRow = {
  referral_key: string;
  created_at: string;
};

type EnsureReferralLinkResult = {
  created?: boolean;
  referralKey?: string;
  createdAt?: string;
  reason?: string;
};

type ActiveInvitationRow = {
  invite_slot: number;
  status: string;
  eligibility_check_id: string | number | null;
  activation_network: string | null;
  sybil_status: string;
  slot_released_at: string | null;
};

function walletAuthResponse(error: unknown): NextResponse | null {
  if (!(error instanceof WalletAuthenticationError)) return null;
  return NextResponse.json(
    { error: error.message },
    {
      status: error.status,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}

function isSlotOccupying(invitation: ActiveInvitationRow): boolean {
  if (invitation.status === 'PENDING_ACCEPTANCE') return true;

  const hasActiveProof =
    invitation.eligibility_check_id !== null &&
    Boolean(invitation.activation_network) &&
    invitation.sybil_status !== 'BLOCKED';

  if (
    invitation.status === 'ACTIVATING' ||
    invitation.status === 'UNDER_REVIEW'
  ) {
    return hasActiveProof;
  }

  return (
    invitation.status === 'COMPLETED' &&
    hasActiveProof &&
    invitation.slot_released_at === null
  );
}

async function loadSlotsAvailable(inviterWallet: string): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('invitations')
    .select('invite_slot,status,eligibility_check_id,activation_network,sybil_status,slot_released_at')
    .eq('inviter_wallet', inviterWallet)
    .in('status', ['PENDING_ACCEPTANCE', 'ACTIVATING', 'UNDER_REVIEW', 'COMPLETED']);

  if (error) throw error;

  const occupied = new Set<number>();
  for (const row of (data ?? []) as ActiveInvitationRow[]) {
    if (isSlotOccupying(row)) occupied.add(Number(row.invite_slot));
  }

  return clampAvailableSlots(PERMANENT_REFERRAL_SLOT_LIMIT - occupied.size);
}

async function loadActiveReferralLink(inviterWallet: string): Promise<ReferralLinkRow | null> {
  const { data, error } = await supabaseAdmin
    .from('referral_links')
    .select('referral_key,created_at')
    .eq('inviter_wallet', inviterWallet)
    .eq('status', 'ACTIVE')
    .maybeSingle();

  if (error) throw error;
  return (data as ReferralLinkRow | null) ?? null;
}

function responsePayload(link: ReferralLinkRow, slotsAvailable: number) {
  return {
    referralLink: {
      key: link.referral_key,
      createdAt: link.created_at,
      slotsAvailable,
    },
  };
}

function ensuredRow(result: EnsureReferralLinkResult): ReferralLinkRow | null {
  if (
    typeof result.referralKey !== 'string' ||
    result.referralKey.length < 1 ||
    typeof result.createdAt !== 'string' ||
    Number.isNaN(Date.parse(result.createdAt))
  ) {
    return null;
  }

  return {
    referral_key: result.referralKey,
    created_at: result.createdAt,
  };
}

async function requireOwner(request: NextRequest, rawWallet: string | null) {
  if (!rawWallet) {
    return {
      wallet: null,
      response: NextResponse.json(
        { error: 'inviter is required' },
        { status: 400 },
      ),
    };
  }

  const wallet = normalizeAddress(rawWallet);
  if (!/^0x[0-9a-f]{40}$/.test(wallet)) {
    return {
      wallet: null,
      response: NextResponse.json(
        { error: 'Invalid inviter wallet.' },
        { status: 400 },
      ),
    };
  }

  try {
    await requireWalletSession({ request, expectedWallet: wallet });
    return { wallet, response: null };
  } catch (error) {
    const response = walletAuthResponse(error);
    if (response) return { wallet: null, response };
    console.error('Failed to validate referral-link owner session:', error);
    return {
      wallet: null,
      response: NextResponse.json(
        { error: 'Failed to validate wallet verification.' },
        { status: 500 },
      ),
    };
  }
}

export async function GET(request: NextRequest) {
  const owner = await requireOwner(
    request,
    request.nextUrl.searchParams.get('inviter'),
  );
  if (owner.response || !owner.wallet) return owner.response!;

  try {
    const [link, slotsAvailable] = await Promise.all([
      loadActiveReferralLink(owner.wallet),
      loadSlotsAvailable(owner.wallet),
    ]);

    return NextResponse.json(
      link ? responsePayload(link, slotsAvailable) : { referralLink: null },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('Failed to load permanent referral link:', error);
    return NextResponse.json(
      { error: 'Failed to load referral link.' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  let body: { inviterAddress?: string };
  try {
    body = (await request.json()) as { inviterAddress?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const owner = await requireOwner(request, body.inviterAddress ?? null);
  if (owner.response || !owner.wallet) return owner.response!;

  try {
    // Home uses this endpoint as an idempotent "ensure link" operation. Reading
    // an already-existing permanent link must not consume the creation-rate
    // budget merely because the user reopened or refreshed the app.
    const [existing, slotsAvailable] = await Promise.all([
      loadActiveReferralLink(owner.wallet),
      loadSlotsAvailable(owner.wallet),
    ]);
    if (existing) {
      return NextResponse.json(responsePayload(existing, slotsAvailable));
    }

    const rateLimitResponse = await enforceRateLimits([
      {
        scope: 'referral_link_ensure_wallet',
        subject: owner.wallet,
        limit: 8,
        windowSeconds: 60,
      },
    ]);
    if (rateLimitResponse) return rateLimitResponse;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const key = createReferralKey();
      const { data, error } = await supabaseAdmin.rpc(
        'ensure_active_referral_link',
        {
          p_inviter_wallet: owner.wallet,
          p_referral_key: key,
        },
      );

      if (error) throw error;

      const result = (data ?? {}) as EnsureReferralLinkResult;
      const link = ensuredRow(result);
      if (link) {
        return NextResponse.json(
          responsePayload(link, slotsAvailable),
          { status: result.created ? 201 : 200 },
        );
      }

      if (result.reason === 'KEY_COLLISION') {
        continue;
      }

      throw new Error(
        `Unexpected referral-link ensure result: ${result.reason ?? 'UNKNOWN'}`,
      );
    }

    return NextResponse.json(
      { error: 'Failed to generate a unique referral link.' },
      { status: 500 },
    );
  } catch (error) {
    console.error('Failed to create permanent referral link:', error);
    return NextResponse.json(
      { error: 'Failed to create referral link.' },
      { status: 500 },
    );
  }
}
