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

  const {
    data: activeChallengeData,
    error: activeChallengeError,
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

  if (activeChallengeError) {
    console.error('Failed to load active wallet challenge:', activeChallengeError);
    return NextResponse.json(
      { error: 'Failed to prepare wallet verification.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const activeChallenge = activeChallengeData as ChallengeRow | null;

  if (
    activeChallenge?.message &&
    /^[0-9a-f]{64}$/.test(activeChallenge.nonce)
  ) {
    return NextResponse.json(
      {
        walletAddress,
        nonce: activeChallenge.nonce,
        expiresAt: activeChallenge.expires_at,
        message: activeChallenge.message,
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const { error: cleanupError } = await supabaseAdmin
    .from('wallet_auth_challenges')
    .delete()
    .eq('wallet_address', walletAddress)
    .lt('expires_at', nowIso);

  if (cleanupError) {
    console.error('Failed to clear expired wallet challenges:', cleanupError);
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

  if (insertError) {
    console.error('Failed to create wallet challenge:', insertError);
    return NextResponse.json(
      { error: 'Failed to create wallet verification.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  return NextResponse.json(
    { walletAddress, nonce, expiresAt, message },
    { status: 201, headers: { 'Cache-Control': 'no-store' } },
  );
}
