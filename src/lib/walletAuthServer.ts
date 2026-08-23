import { createHash } from 'node:crypto';

import type { NextRequest } from 'next/server';

import { normalizeAddress } from '@/lib/serverStore';
import { supabaseAdmin } from '@/lib/supabaseServer';

export const WALLET_SESSION_COOKIE_NAME =
  'veinvite_session';

const SESSION_TOKEN_PATTERN = /^[0-9a-f]{64}$/;
const WALLET_PATTERN = /^0x[0-9a-f]{40}$/;

export type WalletSession = {
  id: number;
  walletAddress: string;
  expiresAt: string;
};

function hashSessionToken(token: string) {
  return createHash('sha256')
    .update(token)
    .digest('hex');
}

function readSessionToken(
  request: NextRequest,
): string | null {
  const token = request.cookies.get(
    WALLET_SESSION_COOKIE_NAME,
  )?.value;

  if (!token) {
    return null;
  }

  const normalized =
    token.trim().toLowerCase();

  if (!SESSION_TOKEN_PATTERN.test(normalized)) {
    return null;
  }

  return normalized;
}

export async function getWalletSession(
  request: NextRequest,
): Promise<WalletSession | null> {
  const token = readSessionToken(request);

  if (!token) {
    return null;
  }

  const tokenHash = hashSessionToken(token);
  const now = new Date().toISOString();

  const {
    data,
    error,
  } = await supabaseAdmin
    .from('wallet_auth_sessions')
    .select('id, wallet_address, expires_at')
    .eq('token_hash', tokenHash)
    .is('revoked_at', null)
    .gt('expires_at', now)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to validate wallet session: ${error.message}`,
    );
  }

  if (!data) {
    return null;
  }

  const walletAddress = normalizeAddress(
    String(data.wallet_address),
  );

  if (!WALLET_PATTERN.test(walletAddress)) {
    throw new Error(
      'Stored wallet session has an invalid wallet address.',
    );
  }

  const id = Number(data.id);
  const expiresAt = String(data.expires_at);

  if (
    !Number.isSafeInteger(id) ||
    id < 1 ||
    Number.isNaN(Date.parse(expiresAt))
  ) {
    throw new Error(
      'Stored wallet session is malformed.',
    );
  }

  return {
    id,
    walletAddress,
    expiresAt,
  };
}

export async function requireWalletSession({
  request,
  expectedWallet,
}: {
  request: NextRequest;
  expectedWallet?: string;
}): Promise<WalletSession> {
  const session = await getWalletSession(request);

  if (!session) {
    throw new WalletAuthenticationError(
      'Wallet verification is required.',
      401,
    );
  }

  if (expectedWallet) {
    const normalizedExpected =
      normalizeAddress(expectedWallet);

    if (
      !WALLET_PATTERN.test(normalizedExpected) ||
      session.walletAddress !== normalizedExpected
    ) {
      throw new WalletAuthenticationError(
        'The verified wallet does not match this request.',
        403,
      );
    }
  }

  return session;
}

export async function revokeWalletSession(
  request: NextRequest,
): Promise<void> {
  const token = readSessionToken(request);

  if (!token) {
    return;
  }

  const tokenHash = hashSessionToken(token);

  const { error } = await supabaseAdmin
    .from('wallet_auth_sessions')
    .update({
      revoked_at: new Date().toISOString(),
    })
    .eq('token_hash', tokenHash)
    .is('revoked_at', null);

  if (error) {
    throw new Error(
      `Failed to revoke wallet session: ${error.message}`,
    );
  }
}

export class WalletAuthenticationError extends Error {
  readonly status: number;

  constructor(
    message: string,
    status: number,
  ) {
    super(message);
    this.name = 'WalletAuthenticationError';
    this.status = status;
  }
}
