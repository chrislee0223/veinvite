import { NextResponse } from 'next/server';

import {
  readVeInviteAllocationEvidence,
} from '@/lib/rewards/allocationAccounting';

export async function GET() {
  if (process.env.VERCEL_ENV === 'production') {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const evidence = await readVeInviteAllocationEvidence();

    return NextResponse.json({
      count: evidence.length,
      latest: evidence.at(-1) ?? null,
      recent: evidence.slice(-5),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Allocation diagnostic failed.',
      },
      { status: 500 },
    );
  }
}
