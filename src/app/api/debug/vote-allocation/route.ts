import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  readMissionVoteAllocationsFromChain,
} from '@/lib/impact/voteAllocations';

export const dynamic = 'force-dynamic';

function parseSafeInteger(
  value: string | null,
): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) &&
    parsed >= 0
    ? parsed
    : null;
}

export async function GET(
  request: NextRequest,
) {
  if (
    process.env.VERCEL_ENV ===
    'production'
  ) {
    return NextResponse.json(
      { error: 'Not found.' },
      { status: 404 },
    );
  }

  const voter =
    request.nextUrl.searchParams.get('voter')
      ?.trim()
      .toLowerCase() ?? '';
  const txId =
    request.nextUrl.searchParams.get('txId')
      ?.trim()
      .toLowerCase() ?? '';
  const blockNumber = parseSafeInteger(
    request.nextUrl.searchParams.get('block'),
  );
  const voteRoundId = parseSafeInteger(
    request.nextUrl.searchParams.get('round'),
  );

  if (
    !/^0x[0-9a-f]{40}$/.test(voter) ||
    !/^0x[0-9a-f]{64}$/.test(txId) ||
    blockNumber === null ||
    voteRoundId === null
  ) {
    return NextResponse.json(
      {
        error:
          'voter, txId, block, and round are required.',
      },
      { status: 400 },
    );
  }

  try {
    const decoded =
      await readMissionVoteAllocationsFromChain({
        walletAddress: voter,
        txId,
        blockNumber,
        voteRoundId,
      });

    return NextResponse.json(
      {
        mode: 'read-only',
        databaseUpdated: false,
        voter,
        txId,
        blockNumber,
        voteRoundId,
        ...decoded,
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
      'Vote allocation decode failed:',
      error,
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Vote allocation decode failed.',
      },
      { status: 500 },
    );
  }
}
