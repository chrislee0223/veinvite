import { createHash } from 'node:crypto';

import type { NextRequest } from 'next/server';

import { normalizeAddress } from '@/lib/serverStore';
import { supabaseAdmin } from '@/lib/supabaseServer';

export const LEGACY_WALLET_SESSION_COOKIE_NAME =
  'veinvite_session';
export const WALLET_SESSION_COOKIE_NAME =
  process.env.NODE_ENV === 'production'
    ? '__Host-veinvite_session'
    : LEGACY_WALLET_SESSION_COOKIE_NAME;

const SESSION_TOKEN_PATTERN = /^[0-9a-f]{64}$/;
const WALLET_PATTERN = /^0x[0-9a-f]{40}$/;
const SESSION_ABSOLUTE_LIFETIME_DAYS = 30;
const SESSION_ABSOLUTE_LIFETIME_MS =
  SESSION_ABSOLUTE_LIFETIME_DAYS *
  24 *
  60 *
  60 *
  1000;

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

function walletSessionCookieNames() {
  return Array.from(
    new Set([
      WALLET_SESSION_COOKIE_NAME,
      LEGACY_WALLET_SESSION_COOKIE_NAME,
    ]),
  );
}

export function getWalletSessionCookieCount(
  request: NextRequest,
): number {
  return walletSessionCookieNames().reduce(
    (count, name) =>
      count + request.cookies.getAll(name).length,
    0,
  );
}

export function readWalletSessionTokens(
  request: NextRequest,
): string[] {
  const tokens = walletSessionCookieNames()
    .flatMap((name) =>
      request.cookies
        .getAll(name)
        .map((cookie) => cookie.value),
    )
    .map((token) => token.trim().toLowerCase())
    .filter((token) =>
      SESSION_TOKEN_PATTERN.test(token),
    );

  return Array.from(new Set(tokens));
}

export async function getWalletSessionFromTokens(
  tokens: string[],
): Promise<WalletSession | null> {
  const normalizedTokens = Array.from(
    new Set(
      tokens
        .map((token) => token.trim().toLowerCase())
        .filter((token) =>
          SESSION_TOKEN_PATTERN.test(token),
        ),
    ),
  );

  if (normalizedTokens.length < 1) {
    return null;
  }

  const tokenHashes = normalizedTokens.map(
    hashSessionToken,
  );
  const nowDate = new Date();
  const now = nowDate.toISOString();
  const absoluteCreatedAfter = new Date(
    nowDate.getTime() -
      SESSION_ABSOLUTE_LIFETIME_MS,
  ).toISOString();

  const {
    data,
    error,
  } = await supabaseAdmin
    .from('wallet_auth_sessions')
    .select(
      'id, wallet_address, expires_at, created_at',
    )
    .in('token_hash', tokenHashes)
    .is('revoked_at', null)
    .gt('expires_at', now)
    .gt('created_at', absoluteCreatedAfter)
    .order('created_at', {
      ascending: false,
    })
    .limit(1)
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

export async function getWalletSession(
  request: NextRequest,
): Promise<WalletSession | null> {
  return getWalletSessionFromTokens(
    readWalletSessionTokens(request),
  );
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
  const tokens = readWalletSessionTokens(request);

  if (tokens.length < 1) {
    return;
  }

  const tokenHashes = tokens.map(
    hashSessionToken,
  );

  const { error } = await supabaseAdmin
    .from('wallet_auth_sessions')
    .update({
      revoked_at: new Date().toISOString(),
    })
    .in('token_hash', tokenHashes)
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
