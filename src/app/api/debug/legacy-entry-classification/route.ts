import { NextResponse } from 'next/server';

import {
  checkHistoricalVeBetterEntryEligibility,
} from '@/lib/vebetter/historicalEntryEligibility';

export const dynamic = 'force-dynamic';

const CASES = [
  {
    inviteCode: 'WVYTYY6',
    walletAddress: '0xe422f50c6f9a804381797ea37c9af8b11bc1892b',
    checkedBlock: 25546954,
  },
  {
    inviteCode: '3KH8K2W',
    walletAddress: '0x61325b655ecf3563219cdbee383969d1d6df82f8',
    checkedBlock: 25547016,
  },
  {
    inviteCode: 'ZKBL7RZ',
    walletAddress: '0xc12b77b4467e3edd6b16c978b8387a6a3af8e8d7',
    checkedBlock: 25686769,
  },
] as const;

export async function GET() {
  if (process.env.VERCEL_ENV === 'production') {
    return new NextResponse('Not Found', { status: 404 });
  }

  const results = [];

  for (const item of CASES) {
    try {
      const classification =
        await checkHistoricalVeBetterEntryEligibility({
          walletAddress: item.walletAddress,
          checkedBlock: item.checkedBlock,
        });

      results.push({
        ...item,
        ok: true,
        classification,
      });
    } catch (error) {
      results.push({
        ...item,
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Historical entry audit failed.',
      });
    }
  }

  return NextResponse.json(
    { results },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
