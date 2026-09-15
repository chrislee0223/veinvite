import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  backfillMissionVoteAllocations,
} from '@/lib/impact/backfillVoteAllocations';

export const dynamic = 'force-dynamic';

function parseLimit(
  value: string | null,
): number {
  if (!value) {
    return 250;
  }

  const parsed = Number(value);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 1 ||
    parsed > 1000
  ) {
    throw new Error(
      'limit must be an integer between 1 and 1000.',
    );
  }

  return parsed;
}

export async function POST(
  request: NextRequest,
) {
  const secret =
    process.env
      .VOTE_ALLOCATION_BACKFILL_SECRET;

  // Secure by default: the route does not exist operationally until a
  // dedicated server-only secret is configured for a controlled backfill.
  if (!secret) {
    return NextResponse.json(
      { error: 'Not found.' },
      { status: 404 },
    );
  }

  if (
    request.headers.get('authorization') !==
    `Bearer ${secret}`
  ) {
    return NextResponse.json(
      { error: 'Unauthorized.' },
      { status: 401 },
    );
  }

  try {
    const write =
      request.nextUrl.searchParams.get('write') ===
      'true';
    const limit = parseLimit(
      request.nextUrl.searchParams.get('limit'),
    );

    const result =
      await backfillMissionVoteAllocations({
        write,
        limit,
      });

    return NextResponse.json(result, {
      headers: {
        'Cache-Control':
          'no-store, max-age=0',
      },
    });
  } catch (error) {
    console.error(
      'Vote allocation backfill failed:',
      error,
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Vote allocation backfill failed.',
      },
      { status: 500 },
    );
  }
}
