import { NextResponse } from 'next/server';

import {
  getVeBetterVot3ConversionProgress,
} from '@/lib/vebetter/vot3Conversion';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (process.env.VERCEL_ENV === 'production') {
    return new NextResponse(null, {
      status: 404,
    });
  }

  const wallet =
    '0xc12b77b4467e3edd6b16c978b8387a6a3af8e8d7';

  const result =
    await getVeBetterVot3ConversionProgress({
      walletAddress: wallet,
      activationBlock: 18_000_000,
      firstQualifyingRewardBlock:
        18_000_000,
    });

  return NextResponse.json({
    mode: 'READ_ONLY_VOT3_CONVERSION_SELF_AUDIT',
    writesPerformed: false,
    transfersPerformed: false,
    wallet,
    result,
  }, {
    headers: {
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
    },
  });
}
