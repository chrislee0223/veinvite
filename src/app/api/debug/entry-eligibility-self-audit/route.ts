import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  checkVeBetterEntryEligibility,
} from '@/lib/vebetter/entryEligibility';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
) {
  if (
    process.env.VERCEL_ENV ===
    'production'
  ) {
    return new NextResponse(null, {
      status: 404,
    });
  }

  const wallet =
    request.nextUrl.searchParams.get(
      'wallet',
    );

  if (!wallet) {
    return NextResponse.json(
      { error: 'wallet is required' },
      { status: 400 },
    );
  }

  try {
    const result =
      await checkVeBetterEntryEligibility({
        walletAddress: wallet,
      });

    return NextResponse.json(
      {
        mode: 'read-only',
        databaseUpdated: false,
        ...result,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error) {
    console.error(
      'Eligibility self-audit failed:',
      error,
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'audit failed',
      },
      { status: 500 },
    );
  }
}
