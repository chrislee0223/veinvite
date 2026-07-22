import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  getVeBetterVoteProgress,
} from '@/lib/vebetter/vote';

export const dynamic =
  'force-dynamic';

function isValidAddress(
  address: string,
): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(
    address,
  );
}

function parseFromBlock(
  value: string | null,
): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number(value);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 0
  ) {
    return null;
  }

  return parsed;
}

export async function GET(
  request: NextRequest,
) {
  /*
   * This debug endpoint must never
   * be available on Production.
   */
  if (
    process.env.VERCEL_ENV ===
    'production'
  ) {
    return NextResponse.json(
      {
        error: 'Not found.',
      },
      {
        status: 404,
      },
    );
  }

  const voterAddress =
    request.nextUrl.searchParams.get(
      'voter',
    );

  const fromBlock =
    parseFromBlock(
      request.nextUrl.searchParams.get(
        'fromBlock',
      ),
    );

  if (
    !voterAddress ||
    !isValidAddress(voterAddress)
  ) {
    return NextResponse.json(
      {
        error:
          'A valid voter address is required.',
      },
      {
        status: 400,
      },
    );
  }

  if (fromBlock === null) {
    return NextResponse.json(
      {
        error:
          'A valid fromBlock is required.',
      },
      {
        status: 400,
      },
    );
  }

  try {
    const progress =
      await getVeBetterVoteProgress({
        voterAddress,
        fromBlock,
      });

    return NextResponse.json(
      {
        mode: 'read-only',
        databaseUpdated: false,
        voterAddress:
          voterAddress.toLowerCase(),
        fromBlock,
        ...progress,
      },
      {
        headers: {
          'Cache-Control':
            'no-store, max-age=0',
        },
      },
    );
  } catch (error) {
    console.error(
      'Read-only vote scan failed:',
      error,
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Vote scan failed.',
      },
      {
        status: 500,
      },
    );
  }
}
