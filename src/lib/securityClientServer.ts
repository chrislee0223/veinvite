import {
  createHash,
  randomBytes,
} from 'node:crypto';

import type {
  NextRequest,
  NextResponse,
} from 'next/server';

import { normalizeAddress } from '@/lib/serverStore';
import { supabaseAdmin } from '@/lib/supabaseServer';

export const SECURITY_CLIENT_COOKIE_NAME =
  process.env.NODE_ENV === 'production'
    ? '__Host-veinvite_security_client'
    : 'veinvite_security_client';

const SECURITY_CLIENT_TOKEN_PATTERN = /^[0-9a-f]{64}$/;
const WALLET_PATTERN = /^0x[0-9a-f]{40}$/;
const SECURITY_CLIENT_LIFETIME_DAYS = 365;
const SECURITY_CLIENT_LIFETIME_SECONDS =
  SECURITY_CLIENT_LIFETIME_DAYS * 24 * 60 * 60;

function hashSecurityClientToken(token: string) {
  return createHash('sha256')
    .update(token)
    .digest('hex');
}

function readSecurityClientToken(
  request: NextRequest,
): string | null {
  const token = request.cookies
    .get(SECURITY_CLIENT_COOKIE_NAME)
    ?.value
    .trim()
    .toLowerCase();

  return token &&
    SECURITY_CLIENT_TOKEN_PATTERN.test(token)
    ? token
    : null;
}

function setSecurityClientCookie({
  response,
  token,
}: {
  response: NextResponse;
  token: string;
}) {
  response.cookies.set({
    name: SECURITY_CLIENT_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure:
      process.env.NODE_ENV ===
      'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SECURITY_CLIENT_LIFETIME_SECONDS,
    expires: new Date(
      Date.now() +
        SECURITY_CLIENT_LIFETIME_SECONDS * 1000,
    ),
  });
}

/**
 * Records a pseudonymous browser/client -> verified wallet relationship.
 *
 * This is intentionally separate from analytics visitor/session identity. The
 * raw random client token exists only in an HttpOnly cookie; the database sees
 * only its SHA-256 hash. No hardware identifier, phone number, wallet secret,
 * advertising identifier or browser-fingerprint component is collected here.
 *
 * A missing/cleared cookie creates a new pseudonymous client. Therefore absence
 * of a relationship is never proof that two wallets belong to different
 * people; shared-client evidence is only one anti-abuse signal.
 *
 * Recording is best-effort. Wallet authentication remains available during a
 * transient security-observation write failure, while the database reward gate
 * continues to require the normal Sybil checks before eligibility.
 */
export async function ensureSecurityClientForWallet({
  request,
  response,
  walletAddress,
}: {
  request: NextRequest;
  response: NextResponse;
  walletAddress: string;
}): Promise<void> {
  const normalizedWallet =
    normalizeAddress(walletAddress);

  if (!WALLET_PATTERN.test(normalizedWallet)) {
    console.error(
      'Security client observation received an invalid verified wallet.',
    );
    return;
  }

  const existingToken =
    readSecurityClientToken(request);
  const token =
    existingToken ??
    randomBytes(32).toString('hex');
  const clientHash =
    hashSecurityClientToken(token);

  if (!existingToken) {
    setSecurityClientCookie({
      response,
      token,
    });
  }

  const { error } = await supabaseAdmin.rpc(
    'record_security_client_wallet_observation',
    {
      p_client_hash: clientHash,
      p_wallet_address: normalizedWallet,
      p_observed_at: new Date().toISOString(),
    },
  );

  if (error) {
    // Never log the raw client token/hash or the wallet address. This signal is
    // supplemental and can be retried on a later authenticated session read.
    console.error(
      'Failed to record VeInvite security client observation:',
      error.message,
    );
  }
}
