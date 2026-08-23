import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/supabaseServer';
import { getVeBetterNetworkConfig } from '@/lib/vebetter/network';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { error } = await supabaseAdmin
      .from('invitations')
      .select('id', {
        head: true,
        count: 'exact',
      });

    if (error) {
      throw error;
    }

    return NextResponse.json(
      {
        ok: true,
        app: 'VeInvite',
        version: '0.1.0',
        database: 'ready',
        network:
          getVeBetterNetworkConfig()
            .network,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error) {
    console.error(
      'VeInvite readiness check failed:',
      error,
    );

    return NextResponse.json(
      {
        ok: false,
        app: 'VeInvite',
        version: '0.1.0',
        database: 'unavailable',
      },
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }
}
