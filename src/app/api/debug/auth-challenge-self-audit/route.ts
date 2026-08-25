import {
  NextResponse,
} from 'next/server';

export const dynamic = 'force-dynamic';

const TEST_WALLET =
  '0x000000000000000000000000000000000000a11d';

export async function GET() {
  if (
    process.env.VERCEL_ENV ===
    'production'
  ) {
    return new NextResponse(null, {
      status: 404,
    });
  }

  try {
    const response = await fetch(
      'https://veinvite.vercel.app/api/auth/challenge',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          walletAddress: TEST_WALLET,
        }),
        cache: 'no-store',
      },
    );

    const body = await response.json() as {
      walletAddress?: string;
      nonce?: string;
      expiresAt?: string;
      message?: string;
      error?: string;
    };

    return NextResponse.json(
      {
        mode: 'read-only-except-temporary-auth-challenge',
        productionStatus: response.status,
        productionOk: response.ok,
        walletMatches:
          body.walletAddress?.toLowerCase() ===
          TEST_WALLET,
        hasNonce:
          typeof body.nonce === 'string' &&
          /^[0-9a-f]{64}$/.test(body.nonce),
        hasExpiry:
          typeof body.expiresAt === 'string',
        hasMessage:
          typeof body.message === 'string' &&
          body.message.includes('VeInvite'),
        error: body.error ?? null,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'auth self-audit failed',
      },
      { status: 500 },
    );
  }
}
