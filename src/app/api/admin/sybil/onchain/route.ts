import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  canOperateVeInviteRewards,
  readVeInviteRewardPoolStatus,
} from '@/lib/rewards/onchainPool';
import {
  evaluateOnchainFundingIndicators,
  readOnchainFundingSnapshot,
} from '@/lib/sybil/onchainAnalytics';
import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  requireWalletSession,
  WalletAuthenticationError,
} from '@/lib/walletAuthServer';

const RUN_ANALYTICS_INTENT = 'RUN_ONCHAIN_SYBIL_ANALYTICS';
const INVITE_CODE_PATTERN = /^[A-Z0-9]{7}$/;

type InvitationRow = {
  invite_code: string;
  invitee_wallet: string | null;
  activation_network: string | null;
  activation_block: string | number | null;
  status: string;
  reward_status: string;
};

function noStoreHeaders() {
  return {
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
  };
}

function requestHasSameOrigin(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (!origin) return false;

  try {
    return new URL(origin).origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}

function normalizeInviteCode(value: unknown) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  return INVITE_CODE_PATTERN.test(normalized)
    ? normalized
    : null;
}

function toPositiveBlock(value: string | number | null) {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d+$/.test(value)
        ? Number(value)
        : null;

  return parsed !== null &&
    Number.isSafeInteger(parsed) &&
    parsed > 0
    ? parsed
    : null;
}

async function loadVerifiedOperator(request: NextRequest) {
  const [session, pool] = await Promise.all([
    requireWalletSession({ request }),
    readVeInviteRewardPoolStatus(),
  ]);

  if (!canOperateVeInviteRewards(session.walletAddress, pool)) {
    return {
      response: NextResponse.json(
        {
          error:
            'The verified wallet is not the VeInvite reward operator.',
        },
        {
          status: 403,
          headers: noStoreHeaders(),
        },
      ),
      session: null,
      pool: null,
    };
  }

  return { response: null, session, pool };
}

async function loadInvitation(inviteCode: string) {
  const { data, error } = await supabaseAdmin
    .from('invitations')
    .select(
      'invite_code, invitee_wallet, activation_network, activation_block, status, reward_status',
    )
    .eq('invite_code', inviteCode)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Invitation could not be loaded for on-chain analytics: ${error.message}`,
    );
  }

  return (data as InvitationRow | null) ?? null;
}

async function loadLatestSnapshot(inviteCode: string) {
  const { data, error } = await supabaseAdmin
    .from('sybil_onchain_snapshots')
    .select('*')
    .eq('invite_code', inviteCode)
    .order('checked_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(
      `On-chain Sybil analytics snapshot could not be loaded: ${error.message}`,
    );
  }

  return data ?? null;
}

async function countDistinctReferralsByFunder({
  network,
  column,
  funder,
  currentInviteCode,
}: {
  network: string;
  column: 'first_inbound_vet_sender' | 'first_inbound_vtho_sender';
  funder: string | null;
  currentInviteCode: string;
}) {
  if (!funder) return 0;

  const { data, error } = await supabaseAdmin
    .from('sybil_onchain_snapshots')
    .select('invite_code')
    .eq('network', network)
    .eq(column, funder)
    .neq('invite_code', currentInviteCode);

  if (error) {
    throw new Error(
      `Shared-funder correlation could not be loaded: ${error.message}`,
    );
  }

  return new Set(
    (data ?? []).map((row) => row.invite_code),
  ).size + 1;
}

export async function GET(request: NextRequest) {
  const inviteCode = normalizeInviteCode(
    request.nextUrl.searchParams.get('inviteCode'),
  );

  if (!inviteCode) {
    return NextResponse.json(
      { error: 'A valid 7-character inviteCode is required.' },
      { status: 400, headers: noStoreHeaders() },
    );
  }

  try {
    const operator = await loadVerifiedOperator(request);
    if (operator.response) return operator.response;

    const invitation = await loadInvitation(inviteCode);
    if (!invitation) {
      return NextResponse.json(
        { error: 'Invitation not found.' },
        { status: 404, headers: noStoreHeaders() },
      );
    }

    if (
      invitation.activation_network &&
      invitation.activation_network !== operator.pool!.network
    ) {
      return NextResponse.json(
        { error: 'Invitation network does not match the operator network.' },
        { status: 409, headers: noStoreHeaders() },
      );
    }

    const latestSnapshot = await loadLatestSnapshot(inviteCode);

    return NextResponse.json(
      {
        network: operator.pool!.network,
        verifiedOperator: operator.session!.walletAddress,
        invitation,
        latestSnapshot,
        observationOnly: true,
        transfersPerformed: false,
      },
      { headers: noStoreHeaders() },
    );
  } catch (error) {
    if (error instanceof WalletAuthenticationError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status, headers: noStoreHeaders() },
      );
    }

    console.error('Failed to load on-chain Sybil analytics:', error);
    return NextResponse.json(
      { error: 'On-chain Sybil analytics could not be loaded.' },
      { status: 500, headers: noStoreHeaders() },
    );
  }
}

export async function POST(request: NextRequest) {
  if (!requestHasSameOrigin(request)) {
    return NextResponse.json(
      { error: 'Invalid request origin.' },
      { status: 403, headers: noStoreHeaders() },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body.' },
      { status: 400, headers: noStoreHeaders() },
    );
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    !('intent' in body) ||
    body.intent !== RUN_ANALYTICS_INTENT ||
    !('inviteCode' in body)
  ) {
    return NextResponse.json(
      {
        error:
          `intent must be ${RUN_ANALYTICS_INTENT}; inviteCode is required.`,
      },
      { status: 400, headers: noStoreHeaders() },
    );
  }

  const inviteCode = normalizeInviteCode(body.inviteCode);

  if (!inviteCode) {
    return NextResponse.json(
      { error: 'A valid 7-character inviteCode is required.' },
      { status: 400, headers: noStoreHeaders() },
    );
  }

  try {
    const operator = await loadVerifiedOperator(request);
    if (operator.response) return operator.response;

    const invitation = await loadInvitation(inviteCode);
    if (!invitation) {
      return NextResponse.json(
        { error: 'Invitation not found.' },
        { status: 404, headers: noStoreHeaders() },
      );
    }

    if (!invitation.invitee_wallet) {
      return NextResponse.json(
        { error: 'Invitation has no invitee wallet to analyze.' },
        { status: 409, headers: noStoreHeaders() },
      );
    }

    if (invitation.activation_network !== operator.pool!.network) {
      return NextResponse.json(
        { error: 'Invitation network does not match the operator network.' },
        { status: 409, headers: noStoreHeaders() },
      );
    }

    const activationBlock = toPositiveBlock(
      invitation.activation_block,
    );

    if (!activationBlock) {
      return NextResponse.json(
        {
          error:
            'Invitation is missing the activation block required for historical on-chain analysis.',
        },
        { status: 409, headers: noStoreHeaders() },
      );
    }

    if (invitation.reward_status === 'PAID') {
      return NextResponse.json(
        {
          error:
            'Paid referrals are immutable; on-chain review must be completed before payout settlement.',
        },
        { status: 409, headers: noStoreHeaders() },
      );
    }

    const snapshot = await readOnchainFundingSnapshot({
      walletAddress: invitation.invitee_wallet,
      activationBlock,
    });

    if (snapshot.network !== operator.pool!.network) {
      throw new Error('On-chain analytics network mismatch.');
    }

    const [vetFunderReferralCount, vthoFunderReferralCount] =
      await Promise.all([
        countDistinctReferralsByFunder({
          network: snapshot.network,
          column: 'first_inbound_vet_sender',
          funder: snapshot.firstInboundVet?.sender ?? null,
          currentInviteCode: inviteCode,
        }),
        countDistinctReferralsByFunder({
          network: snapshot.network,
          column: 'first_inbound_vtho_sender',
          funder: snapshot.firstInboundVtho?.sender ?? null,
          currentInviteCode: inviteCode,
        }),
      ]);

    const result = evaluateOnchainFundingIndicators({
      snapshot,
      correlation: {
        vetFunderReferralCount,
        vthoFunderReferralCount,
      },
    });

    const { data: inserted, error: insertError } =
      await supabaseAdmin
        .from('sybil_onchain_snapshots')
        .insert({
          invite_code: inviteCode,
          wallet_address: snapshot.walletAddress,
          network: snapshot.network,
          activation_block: snapshot.activationBlock,
          first_observed_activity_block:
            snapshot.firstObservedActivityBlock,
          age_blocks_at_activation:
            snapshot.ageBlocksAtActivation,
          approximate_age_seconds_at_activation:
            snapshot.approximateAgeSecondsAtActivation,
          first_inbound_vet_block:
            snapshot.firstInboundVet?.blockNumber ?? null,
          first_inbound_vet_sender:
            snapshot.firstInboundVet?.sender ?? null,
          first_inbound_vet_tx_id:
            snapshot.firstInboundVet?.txId ?? null,
          first_inbound_vtho_block:
            snapshot.firstInboundVtho?.blockNumber ?? null,
          first_inbound_vtho_sender:
            snapshot.firstInboundVtho?.sender ?? null,
          first_inbound_vtho_tx_id:
            snapshot.firstInboundVtho?.txId ?? null,
          vet_funder_referral_count: vetFunderReferralCount,
          vtho_funder_referral_count: vthoFunderReferralCount,
          indicators: result.indicators,
          observation_only: true,
          checked_at: snapshot.checkedAt,
        })
        .select('*')
        .single();

    if (insertError) {
      throw new Error(
        `On-chain analytics snapshot could not be stored: ${insertError.message}`,
      );
    }

    return NextResponse.json(
      {
        network: operator.pool!.network,
        verifiedOperator: operator.session!.walletAddress,
        invitation,
        snapshot: inserted,
        indicators: result.indicators,
        correlation: result.correlation,
        observationOnly: true,
        sybilStatusChanged: false,
        rewardStatusChanged: false,
        transfersPerformed: false,
      },
      { headers: noStoreHeaders() },
    );
  } catch (error) {
    if (error instanceof WalletAuthenticationError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status, headers: noStoreHeaders() },
      );
    }

    console.error('Failed to run on-chain Sybil analytics:', error);
    return NextResponse.json(
      { error: 'On-chain Sybil analytics could not be completed.' },
      { status: 500, headers: noStoreHeaders() },
    );
  }
}
