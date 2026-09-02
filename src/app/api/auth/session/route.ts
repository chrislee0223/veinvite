import { createHash } from 'node:crypto';

import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  getWalletSession,
  getWalletSessionCookieCount,
  LEGACY_WALLET_SESSION_COOKIE_NAME,
  readWalletSessionTokens,
  revokeWalletSession,
  WALLET_SESSION_COOKIE_NAME,
} from '@/lib/walletAuthServer';
import { supabaseAdmin } from '@/lib/supabaseServer';

const SLIDING_SESSION_LIFETIME_DAYS = 30;
const SLIDING_SESSION_LIFETIME_SECONDS =
  SLIDING_SESSION_LIFETIME_DAYS * 24 * 60 * 60;
const SESSION_RENEWAL_INTENT = 'renew';
const WALLET_PATTERN = /^0x[0-9a-f]{40}$/;

type RenewalBody = {
  walletAddress?: string;
};

function hashSessionToken(token: string) {
  return createHash('sha256')
    .update(token)
    .digest('hex');
}

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

function setSessionCookie({
  response,
  token,
  expiresAt,
}: {
  response: NextResponse;
  token: string;
  expiresAt: Date;
}) {
  response.cookies.set({
    name: WALLET_SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure:
      process.env.NODE_ENV ===
      'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SLIDING_SESSION_LIFETIME_SECONDS,
    expires: expiresAt,
  });
}

function renewalRequestIsAllowed(
  request: NextRequest,
): boolean {
  if (
    request.headers.get(
      'x-veinvite-session-intent',
    ) !== SESSION_RENEWAL_INTENT
  ) {
    return false;
  }

  const origin = request.headers.get('origin');

  if (!origin) {
    // Some wallet WebViews omit Origin on same-site fetches. The required
    // custom header cannot be submitted by a cross-site HTML form, while a
    // cross-origin script would need a CORS preflight that VeInvite does not
    // allow, so WebView compatibility does not weaken ordinary CSRF defense.
    return true;
  }

  try {
    return (
      new URL(origin).origin ===
      request.nextUrl.origin
    );
  } catch {
    return false;
  }
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

export async function POST(
  request: NextRequest,
) {
  if (!renewalRequestIsAllowed(request)) {
    return NextResponse.json(
      {
        error: 'Invalid session renewal request.',
      },
      {
        status: 403,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  let body: RenewalBody;

  try {
    body = (await request.json()) as RenewalBody;
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body.' },
      {
        status: 400,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  const expectedWallet =
    body.walletAddress
      ?.trim()
      .toLowerCase() ?? '';

  if (!WALLET_PATTERN.test(expectedWallet)) {
    return NextResponse.json(
      { error: 'Invalid wallet address.' },
      {
        status: 400,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  try {
    const session =
      await getWalletSession(request);

    if (!session) {
      return NextResponse.json(
        { authenticated: false },
        {
          status: 401,
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    // Never extend a stale session that belongs to a different wallet while a
    // wallet provider is switching/restoring accounts.
    if (session.walletAddress !== expectedWallet) {
      return NextResponse.json(
        {
          authenticated: false,
          error:
            'The verified wallet does not match the connected wallet.',
        },
        {
          status: 403,
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    const tokens =
      readWalletSessionTokens(request);
    const now = new Date();
    const nowIso = now.toISOString();

    const {
      data: sessionRow,
      error: sessionRowError,
    } = await supabaseAdmin
      .from('wallet_auth_sessions')
      .select('token_hash')
      .eq('id', session.id)
      .eq(
        'wallet_address',
        session.walletAddress,
      )
      .is('revoked_at', null)
      .gt('expires_at', nowIso)
      .maybeSingle();

    if (sessionRowError) {
      throw new Error(
        `Failed to locate wallet session for renewal: ${sessionRowError.message}`,
      );
    }

    const storedTokenHash =
      sessionRow?.token_hash
        ? String(sessionRow.token_hash)
        : null;
    const sessionToken =
      storedTokenHash
        ? tokens.find(
            (token) =>
              hashSessionToken(token) ===
              storedTokenHash,
          ) ?? null
        : null;

    if (!sessionToken) {
      return NextResponse.json(
        { authenticated: false },
        {
          status: 401,
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    const newExpiresAt = new Date(
      now.getTime() +
        SLIDING_SESSION_LIFETIME_SECONDS *
          1000,
    );

    const {
      data: renewedRow,
      error: renewError,
    } = await supabaseAdmin
      .from('wallet_auth_sessions')
      .update({
        expires_at:
          newExpiresAt.toISOString(),
      })
      .eq('id', session.id)
      .eq(
        'wallet_address',
        session.walletAddress,
      )
      .is('revoked_at', null)
      .gt('expires_at', nowIso)
      .select('id')
      .maybeSingle();

    if (renewError) {
      throw new Error(
        `Failed to renew wallet session: ${renewError.message}`,
      );
    }

    if (!renewedRow) {
      return NextResponse.json(
        { authenticated: false },
        {
          status: 401,
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    const response = NextResponse.json(
      {
        authenticated: true,
        walletAddress:
          session.walletAddress,
        expiresAt:
          newExpiresAt.toISOString(),
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );

    // A normal app re-entry silently moves the same verified session's expiry
    // to 30 days from today. No wallet signature or legal re-consent is part of
    // this renewal path.
    setSessionCookie({
      response,
      token: sessionToken,
      expiresAt: newExpiresAt,
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
  } catch (error) {
    console.error(
      'Failed to renew wallet session:',
      error,
    );

    return NextResponse.json(
      {
        error:
          'Failed to renew wallet session.',
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
