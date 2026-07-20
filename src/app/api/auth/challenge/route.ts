import {
  randomBytes,
} from 'node:crypto';

import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  normalizeAddress,
} from '@/lib/serverStore';
import {
  supabaseAdmin,
} from '@/lib/supabaseServer';

const CHALLENGE_LIFETIME_MINUTES = 5;

function isValidWalletAddress(
  address: string,
) {
  return /^0x[0-9a-f]{40}$/.test(address);
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

export async function POST(
  request: NextRequest,
) {
  let body: {
    walletAddress?: string;
  };

  try {
    body = (await request.json()) as {
      walletAddress?: string;
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

  if (!body.walletAddress) {
    return NextResponse.json(
      {
        error: 'walletAddress is required.',
      },
      {
        status: 400,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  const walletAddress = normalizeAddress(
    body.walletAddress,
  );

  if (!isValidWalletAddress(walletAddress)) {
    return NextResponse.json(
      {
        error: 'Invalid wallet address.',
      },
      {
        status: 400,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  const nonce = randomBytes(32).toString('hex');
  const expiresAt = new Date(
    Date.now() +
      CHALLENGE_LIFETIME_MINUTES *
        60 *
        1000,
  ).toISOString();

  const {
    error: cleanupError,
  } = await supabaseAdmin
    .from('wallet_auth_challenges')
    .delete()
    .eq('wallet_address', walletAddress)
    .is('used_at', null);

  if (cleanupError) {
    console.error(
      'Failed to clear old wallet challenges:',
      cleanupError,
    );

    return NextResponse.json(
      {
        error:
          'Failed to prepare wallet verification.',
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
    error: insertError,
  } = await supabaseAdmin
    .from('wallet_auth_challenges')
    .insert({
      wallet_address: walletAddress,
      nonce,
      expires_at: expiresAt,
    });

  if (insertError) {
    console.error(
      'Failed to create wallet challenge:',
      insertError,
    );

    return NextResponse.json(
      {
        error:
          'Failed to create wallet verification.',
      },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  const message = buildVerificationMessage({
    walletAddress,
    nonce,
    expiresAt,
  });

  return NextResponse.json(
    {
      walletAddress,
      nonce,
      expiresAt,
      message,
    },
    {
      status: 201,
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}
