import { NextRequest, NextResponse } from 'next/server';

import { checkVeBetterEntryEligibility } from '@/lib/vebetter/entryEligibility';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get('wallet')?.trim();

  if (!wallet) {
    return NextResponse.json(
      { error: 'wallet query parameter is required' },
      { status: 400 },
    );
  }

  try {
    const result = await checkVeBetterEntryEligibility({
      walletAddress: wallet,
    });

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Entry eligibility debug check failed:', error);

    return NextResponse.json(
      { error: 'entry eligibility check failed' },
      { status: 500 },
    );
  }
}
