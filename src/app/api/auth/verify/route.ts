import {
  createHash,
  randomBytes,
} from 'node:crypto';

import {
  NextRequest,
  NextResponse,
} from 'next/server';

import { verifyMessage } from 'ethers';

import {
  normalizeAddress,
} from '@/lib/serverStore';
import {
  supabaseAdmin,
} from '@/lib/supabaseServer';

const SESSION_COOKIE_NAME =
  'veinvite_session';

const SESSION_LIFETIME_DAYS = 7;

type WalletChallengeRow = {
  id: number;
  wallet_address: string;
  nonce: string;
  expires_at: string;
  used_at: string | null;
};

function isValidWalletAddress(
  address: string,
) {
  return /^0x[0-9a-f]{40}$/.test(address);
}

function isValidNonce(
  nonce: string,
) {
  return /^[0-9a-f]{64}$/.test(nonce);
}

function buildVerificationMessage({
  walletAddress,
  nonce,
  expiresAt,
}: {
  walletAddress: string;
  nonce: string;
  expiresAt: string;
}) {
  return [
    'Verify your wallet for VeInvite',
    '',
    `Wallet: ${walletAddress}`,
    `Nonce: ${nonce}`,
    `Expires at: ${expiresAt}`,
    '',
    'This request does not create a transaction or cost gas.',
    'Only sign this message on the official VeInvite website.',
  ].join('\n');
}

function hashSessionToken(
  token: string,
) {
  return createHash('sha256')
    .update(token)
    .digest('hex');
}

export async function POST(
  request: NextRequest,
) {
  let body: {
    walletAddress?: string;
    nonce?: string;
    signature?: string;
  };

  try {
    body = (await request.json()) as {
      walletAddress?: string;
      nonce?: string;
      signature?: string;
    };
  } catch {
    return NextResponse.json(
      {
        error: 'Invalid JSON body.',
      },
      {
        status: 400,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  if (
    !body.walletAddress ||
    !body.nonce ||
    !body.signature
  ) {
    return NextResponse.json(
      {
        error:
          'walletAddress, nonce, and signature are required.',
      },
      {
        status: 400,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  const walletAddress =
    normalizeAddress(body.walletAddress);

  const nonce = body.nonce.toLowerCase();

  if (
    !isValidWalletAddress(walletAddress) ||
    !isValidNonce(nonce)
  ) {
    return NextResponse.json(
      {
        error:
          'Invalid wallet authentication request.',
      },
      {
        status: 400,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  const {
    data: challengeData,
    error: challengeError,
  } = await supabaseAdmin
    .from('wallet_auth_challenges')
    .select(
      `
        id,
        wallet_address,
        nonce,
        expires_at,
        used_at
      `,
    )
    .eq('wallet_address', walletAddress)
    .eq('nonce', nonce)
    .maybeSingle();

  if (challengeError) {
    console.error(
      'Failed to load wallet challenge:',
      challengeError,
    );

    return NextResponse.json(
      {
        error:
          'Failed to verify wallet.',
      },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  const challenge =
    challengeData as WalletChallengeRow | null;

  if (!challenge) {
    return NextResponse.json(
      {
        error:
          'Wallet verification request was not found.',
      },
      {
        status: 401,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  if (challenge.used_at) {
    return NextResponse.json(
      {
        error:
          'Wallet verification request was already used.',
      },
      {
        status: 409,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  const now = new Date();

  if (
    new Date(challenge.expires_at) <= now
  ) {
    return NextResponse.json(
      {
        error:
          'Wallet verification request has expired.',
      },
      {
        status: 401,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  const message = buildVerificationMessage({
    walletAddress,
    nonce,
    expiresAt: challenge.expires_at,
  });

  let recoveredAddress: string;

  try {
    recoveredAddress = normalizeAddress(
      verifyMessage(
        message,
        body.signature,
      ),
    );
  } catch {
    return NextResponse.json(
      {
        error: 'Invalid wallet signature.',
      },
      {
        status: 401,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  if (
    recoveredAddress !== walletAddress
  ) {
    return NextResponse.json(
      {
        error:
          'The signature does not match the connected wallet.',
      },
      {
        status: 401,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  const usedAt = now.toISOString();

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

    return NextResponse.json(
      {
        error:
          'Failed to complete wallet verification.',
      },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  if (!consumedChallenge) {
    return NextResponse.json(
      {
        error:
          'Wallet verification request is no longer valid.',
      },
      {
        status: 409,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  const sessionToken =
    randomBytes(32).toString('hex');

  const tokenHash =
    hashSessionToken(sessionToken);

  const sessionExpiresAt = new Date(
    now.getTime() +
      SESSION_LIFETIME_DAYS *
        24 *
        60 *
        60 *
        1000,
  );

  const {
    error: revokeError,
  } = await supabaseAdmin
    .from('wallet_auth_sessions')
    .update({
      revoked_at: usedAt,
    })
    .eq('wallet_address', walletAddress)
    .is('revoked_at', null);

  if (revokeError) {
    console.error(
      'Failed to revoke old wallet sessions:',
      revokeError,
    );

    return NextResponse.json(
      {
        error:
          'Failed to create wallet session.',
      },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  const {
    error: sessionError,
  } = await supabaseAdmin
    .from('wallet_auth_sessions')
    .insert({
      wallet_address: walletAddress,
      token_hash: tokenHash,
      expires_at:
        sessionExpiresAt.toISOString(),
    });

  if (sessionError) {
    console.error(
      'Failed to store wallet session:',
      sessionError,
    );

    return NextResponse.json(
      {
        error:
          'Failed to create wallet session.',
      },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  const response = NextResponse.json(
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
