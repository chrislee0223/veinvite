import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  getWalletSession,
  revokeWalletSession,
  WALLET_SESSION_COOKIE_NAME,
} from '@/lib/walletAuthServer';

export async function GET(
  request: NextRequest,
) {
  try {
    const session =
      await getWalletSession(request);

    if (!session) {
      return NextResponse.json(
        {
          authenticated: false,
        },
        {
          status: 200,
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    return NextResponse.json(
      {
        authenticated: true,
        walletAddress:
          session.walletAddress,
        expiresAt: session.expiresAt,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error) {
    console.error(
      'Failed to read wallet session:',
      error,
    );

    return NextResponse.json(
      {
        error:
          'Failed to read wallet session.',
      },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }
}

export async function DELETE(
  request: NextRequest,
) {
  try {
    await revokeWalletSession(request);
  } catch (error) {
    console.error(
      'Failed to revoke wallet session:',
      error,
    );

    return NextResponse.json(
      {
        error:
          'Failed to revoke wallet session.',
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
      authenticated: false,
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );

  response.cookies.set({
    name: WALLET_SESSION_COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure:
      process.env.NODE_ENV ===
      'production',
    sameSite: 'lax',
    path: '/',
    expires: new Date(0),
  });

  return response;
}
