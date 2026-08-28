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

function parseNonNegativeInteger(
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

function parseTxId(
  value: string | null,
): string | null {
  const normalized =
    value?.trim().toLowerCase() ?? '';

  return /^0x[0-9a-f]{64}$/.test(
    normalized,
  )
    ? normalized
    : null;
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
  const blockNumber =
    parseNonNegativeInteger(
      request.nextUrl.searchParams.get(
        'fromBlock',
      ),
    );
  const txId = parseTxId(
    request.nextUrl.searchParams.get(
      'conversionTxId',
    ),
  );
  const txIndex =
    parseNonNegativeInteger(
      request.nextUrl.searchParams.get(
        'conversionTxIndex',
      ),
    );
  const clauseIndex =
    parseNonNegativeInteger(
      request.nextUrl.searchParams.get(
        'conversionClauseIndex',
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

  if (
    blockNumber === null ||
    txId === null ||
    txIndex === null ||
    clauseIndex === null
  ) {
    return NextResponse.json(
      {
        error:
          'fromBlock, conversionTxId, conversionTxIndex, and conversionClauseIndex are required.',
      },
      {
        status: 400,
      },
    );
  }

  const conversionPosition = {
    blockNumber,
    txId,
    txIndex,
    clauseIndex,
  };

  try {
    const progress =
      await getVeBetterVoteProgress({
        voterAddress,
        conversionPosition,
      });

    return NextResponse.json(
      {
        mode: 'read-only',
        databaseUpdated: false,
        voterAddress:
          voterAddress.toLowerCase(),
        conversionPosition,
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
