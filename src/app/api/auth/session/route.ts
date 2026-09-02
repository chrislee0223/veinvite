import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  getWalletSession,
  getWalletSessionCookieCount,
  LEGACY_WALLET_SESSION_COOKIE_NAME,
  revokeWalletSession,
  WALLET_SESSION_COOKIE_NAME,
} from '@/lib/walletAuthServer';

function clearSessionCookie({
  response,
  name,
}: {
  response: NextResponse;
  name: string;
}) {
  response.cookies.set({
    name,
    value: '',
    httpOnly: true,
    secure:
      process.env.NODE_ENV ===
      'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
    expires: new Date(0),
  });
}

export async function GET(
  request: NextRequest,
) {
  try {
    const session =
      await getWalletSession(request);

    if (!session) {
      const cookieCount =
        getWalletSessionCookieCount(request);

      // Safe diagnostics only: never log cookie values or wallet addresses.
      // This lets production logs distinguish a browser that did not return a
      // session cookie from one that returned only stale/invalid cookies.
      console.info(
        'Wallet session lookup returned unauthenticated.',
        {
          cookieCount,
          host: request.nextUrl.host,
        },
      );

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

  clearSessionCookie({
    response,
    name: WALLET_SESSION_COOKIE_NAME,
  });

  if (
    LEGACY_WALLET_SESSION_COOKIE_NAME !==
    WALLET_SESSION_COOKIE_NAME
  ) {
    clearSessionCookie({
      response,
      name:
        LEGACY_WALLET_SESSION_COOKIE_NAME,
    });
  }

  return response;
}
