import {
  createHash,
  randomBytes,
} from 'node:crypto';

import {
  NextRequest,
  NextResponse,
} from 'next/server';
import { verifyMessage } from 'ethers';
import { Certificate } from '@vechain/sdk-core';

import {
  normalizeAddress,
} from '@/lib/serverStore';
import {
  supabaseAdmin,
} from '@/lib/supabaseServer';
import {
  getVeBetterNetworkConfig,
} from '@/lib/vebetter/network';

const SESSION_COOKIE_NAME =
  'veinvite_session';
const SESSION_LIFETIME_DAYS = 7;
const CERTIFICATE_CLOCK_SKEW_MS =
  2 * 60 * 1000;
const CERTIFICATE_CHALLENGE_WINDOW_MS =
  10 * 60 * 1000;

type WalletChallengeRow = {
  id: number;
  wallet_address: string;
  nonce: string;
  expires_at: string;
  used_at: string | null;
  message: string | null;
  origin: string | null;
  network: string | null;
};

type WalletCertificate = {
  purpose?: string;
  payload?: {
    type?: string;
    content?: string;
  };
  domain?: string;
  timestamp?: number;
  signer?: string;
  signature?: string;
};

type VerifyRequestBody = {
  walletAddress?: string;
  nonce?: string;
  signature?: string;
  certificate?: WalletCertificate;
};

function isValidWalletAddress(
  address: string,
) {
  return /^0x[0-9a-f]{40}$/.test(
    address,
  );
}

function isValidNonce(
  nonce: string,
) {
  return /^[0-9a-f]{64}$/.test(
    nonce,
  );
}

function hashSessionToken(
  token: string,
) {
  return createHash('sha256')
    .update(token)
    .digest('hex');
}

function jsonError(
  message: string,
  status: number,
) {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}

function certificateDomainMatchesOrigin(
  domain: string,
  origin: string,
): boolean {
  const rawDomain =
    domain.trim().toLowerCase();

  if (!rawDomain) {
    return false;
  }

  try {
    const originUrl =
      new URL(origin);
    let certificateHost = rawDomain;

    if (
      /^[a-z][a-z0-9+.-]*:\/\//i.test(
        rawDomain,
      )
    ) {
      certificateHost =
        new URL(rawDomain).host
          .toLowerCase();
    } else if (
      rawDomain.includes('/') ||
      rawDomain.includes('?') ||
      rawDomain.includes('#')
    ) {
      return false;
    }

    return (
      certificateHost ===
        originUrl.host.toLowerCase() ||
      certificateHost ===
        originUrl.hostname.toLowerCase()
    );
  } catch {
    return false;
  }
}

function verifyVeWorldCertificate({
  certificate,
  challenge,
  walletAddress,
  now,
}: {
  certificate: WalletCertificate;
  challenge: WalletChallengeRow;
  walletAddress: string;
  now: Date;
}): string | null {
  if (
    certificate.purpose !==
      'agreement' ||
    certificate.payload?.type !==
      'text' ||
    certificate.payload.content !==
      challenge.message ||
    !certificate.domain ||
    !certificate.signer ||
    !certificate.signature ||
    !Number.isSafeInteger(
      certificate.timestamp,
    ) ||
    !certificate.timestamp ||
    certificate.timestamp <= 0
  ) {
    return 'Invalid VeWorld certificate payload.';
  }

  let certificateSigner: string;

  try {
    certificateSigner =
      normalizeAddress(
        certificate.signer,
      );
  } catch {
    return 'Invalid VeWorld certificate signer.';
  }

  if (
    certificateSigner !==
    walletAddress
  ) {
    return 'The certificate does not match the connected wallet.';
  }

  if (
    !certificateDomainMatchesOrigin(
      certificate.domain,
      challenge.origin || '',
    )
  ) {
    return 'The VeWorld certificate was signed for a different site.';
  }

  const expiresAtMs =
    new Date(
      challenge.expires_at,
    ).getTime();
  const certificateTimestamp =
    certificate.timestamp;

  if (
    certificateTimestamp <
      expiresAtMs -
        CERTIFICATE_CHALLENGE_WINDOW_MS ||
    certificateTimestamp >
      now.getTime() +
        CERTIFICATE_CLOCK_SKEW_MS
  ) {
    return 'The VeWorld certificate timestamp is outside the verification window.';
  }

  try {
    Certificate.of({
      purpose: 'agreement',
      payload: {
        type: 'text',
        content:
          certificate.payload.content,
      },
      domain:
        certificate.domain,
      timestamp:
        certificateTimestamp,
      signer:
        certificateSigner,
      signature:
        certificate.signature,
    }).verify();
  } catch {
    return 'Invalid VeWorld certificate signature.';
  }

  return null;
}

export async function POST(
  request: NextRequest,
) {
  let body: VerifyRequestBody;

  try {
    body =
      (await request.json()) as
        VerifyRequestBody;
  } catch {
    return jsonError(
      'Invalid JSON body.',
      400,
    );
  }

  if (
    !body.walletAddress ||
    !body.nonce ||
    (!body.signature &&
      !body.certificate?.signature)
  ) {
    return jsonError(
      'walletAddress, nonce, and wallet proof are required.',
      400,
    );
  }

  const walletAddress =
    normalizeAddress(
      body.walletAddress,
    );
  const nonce =
    body.nonce.toLowerCase();

  if (
    !isValidWalletAddress(
      walletAddress,
    ) ||
    !isValidNonce(nonce)
  ) {
    return jsonError(
      'Invalid wallet authentication request.',
      400,
    );
  }

  const {
    data: challengeData,
    error: challengeError,
  } = await supabaseAdmin
    .from('wallet_auth_challenges')
    .select(`
      id,
      wallet_address,
      nonce,
      expires_at,
      used_at,
      message,
      origin,
      network
    `)
    .eq(
      'wallet_address',
      walletAddress,
    )
    .eq('nonce', nonce)
    .maybeSingle();

  if (challengeError) {
    console.error(
      'Failed to load wallet challenge:',
      challengeError,
    );

    return jsonError(
      'Failed to verify wallet.',
      500,
    );
  }

  const challenge =
    challengeData as
      | WalletChallengeRow
      | null;

  if (!challenge) {
    return jsonError(
      'Wallet verification request was not found.',
      401,
    );
  }

  if (challenge.used_at) {
    return jsonError(
      'Wallet verification request was already used.',
      409,
    );
  }

  const now = new Date();

  if (
    new Date(
      challenge.expires_at,
    ) <= now
  ) {
    return jsonError(
      'Wallet verification request has expired.',
      401,
    );
  }

  const currentOrigin =
    request.nextUrl.origin;
  const currentNetwork =
    getVeBetterNetworkConfig().network;

  // Legacy/reconstructed challenges are intentionally rejected. New
  // challenges store the exact signed text plus site/network binding.
  if (
    !challenge.message ||
    challenge.origin !==
      currentOrigin ||
    challenge.network !==
      currentNetwork
  ) {
    return jsonError(
      'Wallet verification request is no longer valid. Please start verification again.',
      401,
    );
  }

  if (body.certificate) {
    if (
      body.signature &&
      body.certificate.signature &&
      body.signature.toLowerCase() !==
        body.certificate.signature
          .toLowerCase()
    ) {
      return jsonError(
        'Wallet proof signatures do not match.',
        401,
      );
    }

    const certificateError =
      verifyVeWorldCertificate({
        certificate:
          body.certificate,
        challenge,
        walletAddress,
        now,
      });

    if (certificateError) {
      return jsonError(
        certificateError,
        401,
      );
    }
  } else {
    let recoveredAddress: string;

    try {
      recoveredAddress =
        normalizeAddress(
          verifyMessage(
            challenge.message,
            body.signature!,
          ),
        );
    } catch {
      return jsonError(
        'Invalid wallet signature.',
        401,
      );
    }

    if (
      recoveredAddress !==
      walletAddress
    ) {
      return jsonError(
        'The signature does not match the connected wallet.',
        401,
      );
    }
  }

  const usedAt =
    now.toISOString();

  // Consume exactly once after a valid proof. The conditional update also
  // closes concurrent verification attempts using the same challenge.
  const {
    data: consumedChallenge,
    error: consumeError,
  } = await supabaseAdmin
    .from('wallet_auth_challenges')
    .update({
      used_at: usedAt,
    })
    .eq('id', challenge.id)
    .is('used_at', null)
    .gt('expires_at', usedAt)
    .select('id')
    .maybeSingle();

  if (consumeError) {
    console.error(
      'Failed to consume wallet challenge:',
      consumeError,
    );

    return jsonError(
      'Failed to complete wallet verification.',
      500,
    );
  }

  if (!consumedChallenge) {
    return jsonError(
      'Wallet verification request is no longer valid.',
      409,
    );
  }

  const sessionToken =
    randomBytes(32).toString('hex');
  const tokenHash =
    hashSessionToken(
      sessionToken,
    );

  const sessionExpiresAt =
    new Date(
      now.getTime() +
        SESSION_LIFETIME_DAYS *
          24 *
          60 *
          60 *
          1000,
    );

  const { error: revokeError } =
    await supabaseAdmin
      .from('wallet_auth_sessions')
      .update({
        revoked_at: usedAt,
      })
      .eq(
        'wallet_address',
        walletAddress,
      )
      .is('revoked_at', null);

  if (revokeError) {
    console.error(
      'Failed to revoke old wallet sessions:',
      revokeError,
    );

    return jsonError(
      'Failed to create wallet session.',
      500,
    );
  }

  const { error: sessionError } =
    await supabaseAdmin
      .from('wallet_auth_sessions')
      .insert({
        wallet_address:
          walletAddress,
        token_hash: tokenHash,
        expires_at:
          sessionExpiresAt.toISOString(),
      });

  if (sessionError) {
    console.error(
      'Failed to store wallet session:',
      sessionError,
    );

    return jsonError(
      'Failed to create wallet session.',
      500,
    );
  }

  const response =
    NextResponse.json(
      {
        walletAddress,
        expiresAt:
          sessionExpiresAt.toISOString(),
      },
      {
        status: 201,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );

  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: sessionToken,
    httpOnly: true,
    secure:
      process.env.NODE_ENV ===
      'production',
    sameSite: 'lax',
    path: '/',
    expires: sessionExpiresAt,
  });

  return response;
}
