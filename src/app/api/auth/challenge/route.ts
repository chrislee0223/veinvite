import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

import {
  enforceRateLimits,
  getClientIpSubject,
} from '@/lib/rateLimitServer';
import { normalizeAddress } from '@/lib/serverStore';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { getVeBetterNetworkConfig } from '@/lib/vebetter/network';

const CHALLENGE_LIFETIME_MINUTES = 5;

function isValidWalletAddress(address: string) {
  return /^0x[0-9a-f]{40}$/.test(address);
}

function buildVerificationMessage(args: {
  origin: string;
  network: string;
  walletAddress: string;
  nonce: string;
  expiresAt: string;
}) {
  return [
    'Verify your wallet for VeInvite',
    '',
    `Domain: ${new URL(args.origin).host}`,
    `URI: ${args.origin}`,
    `Network: ${args.network}`,
    `Wallet: ${args.walletAddress}`,
    `Nonce: ${args.nonce}`,
    `Expires at: ${args.expiresAt}`,
    '',
    'This request does not create a transaction or cost gas.',
    'Only sign this message on the VeInvite site shown above.',
  ].join('\n');
}

type ChallengeRow = {
  nonce: string;
  expires_at: string;
  message: string | null;
};

async function loadActiveChallenge({
  walletAddress,
  origin,
  network,
  nowIso,
}: {
  walletAddress: string;
  origin: string;
  network: string;
  nowIso: string;
}): Promise<ChallengeRow | null> {
  const {
    data,
    error,
  } = await supabaseAdmin
    .from('wallet_auth_challenges')
    .select('nonce, expires_at, message')
    .eq('wallet_address', walletAddress)
    .eq('origin', origin)
    .eq('network', network)
    .is('used_at', null)
    .gt('expires_at', nowIso)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to load active wallet challenge: ${error.message}`,
    );
  }

  return (data as ChallengeRow | null) ?? null;
}

function challengeResponse({
  walletAddress,
  challenge,
  status,
}: {
  walletAddress: string;
  challenge: ChallengeRow;
  status: 200 | 201;
}) {
  return NextResponse.json(
    {
      walletAddress,
      nonce: challenge.nonce,
      expiresAt: challenge.expires_at,
      message: challenge.message,
    },
    {
      status,
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}

function isUsableChallenge(
  challenge: ChallengeRow | null,
): challenge is ChallengeRow & { message: string } {
  return Boolean(
    challenge?.message &&
      /^[0-9a-f]{64}$/.test(challenge.nonce) &&
      !Number.isNaN(Date.parse(challenge.expires_at)),
  );
}

export async function POST(request: NextRequest) {
  const clientIp =
    getClientIpSubject(request);
  const rateLimitResponse =
    await enforceRateLimits([
      clientIp
        ? {
            scope: 'auth_challenge_ip',
            subject: clientIp,
            limit: 12,
            windowSeconds: 60,
          }
        : null,
    ]);

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  let body: { walletAddress?: string };

  try {
    body = (await request.json()) as { walletAddress?: string };
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  if (!body.walletAddress) {
    return NextResponse.json(
      { error: 'walletAddress is required.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const walletAddress = normalizeAddress(body.walletAddress);

  if (!isValidWalletAddress(walletAddress)) {
    return NextResponse.json(
      { error: 'Invalid wallet address.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const origin = request.nextUrl.origin;
  const { network } = getVeBetterNetworkConfig();
  const nowIso = new Date().toISOString();

  let activeChallenge: ChallengeRow | null;

  try {
    activeChallenge = await loadActiveChallenge({
      walletAddress,
      origin,
      network,
      nowIso,
    });
  } catch (error) {
    console.error(
      'Failed to load active wallet challenge:',
      error,
    );
    return NextResponse.json(
      { error: 'Failed to prepare wallet verification.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  if (isUsableChallenge(activeChallenge)) {
    return challengeResponse({
      walletAddress,
      challenge: activeChallenge,
      status: 200,
    });
  }

  const { error: cleanupError } = await supabaseAdmin
    .from('wallet_auth_challenges')
    .delete()
    .eq('wallet_address', walletAddress)
    .eq('origin', origin)
    .eq('network', network)
    .is('used_at', null)
    .lte('expires_at', nowIso);

  if (cleanupError) {
    console.error(
      'Failed to clear expired wallet challenges:',
      cleanupError,
    );
    return NextResponse.json(
      { error: 'Failed to prepare wallet verification.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const nonce = randomBytes(32).toString('hex');
  const expiresAt = new Date(
    Date.now() + CHALLENGE_LIFETIME_MINUTES * 60 * 1000,
  ).toISOString();

  const message = buildVerificationMessage({
    origin,
    network,
    walletAddress,
    nonce,
    expiresAt,
  });

  const newChallenge: ChallengeRow = {
    nonce,
    expires_at: expiresAt,
    message,
  };

  const { error: insertError } = await supabaseAdmin
    .from('wallet_auth_challenges')
    .insert({
      wallet_address: walletAddress,
      nonce,
      expires_at: expiresAt,
      message,
      origin,
      network,
    });

  if (!insertError) {
    return challengeResponse({
      walletAddress,
      challenge: newChallenge,
      status: 201,
    });
  }

  // A concurrent request can win the one-unused-challenge unique index after
  // this request's initial lookup. In that case, return the winner rather than
  // surfacing a transient 500 to the wallet UI.
  if (insertError.code === '23505') {
    try {
      const concurrentChallenge = await loadActiveChallenge({
        walletAddress,
        origin,
        network,
        nowIso: new Date().toISOString(),
      });

      if (isUsableChallenge(concurrentChallenge)) {
        return challengeResponse({
          walletAddress,
          challenge: concurrentChallenge,
          status: 200,
        });
      }
    } catch (error) {
      console.error(
        'Failed to recover concurrent wallet challenge:',
        error,
      );
    }
  }

  console.error(
    'Failed to create wallet challenge:',
    insertError,
  );
  return NextResponse.json(
    { error: 'Failed to create wallet verification.' },
    { status: 500, headers: { 'Cache-Control': 'no-store' } },
  );
}
