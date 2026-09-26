import { NextRequest, NextResponse } from 'next/server';

import { loadActiveSybilV2Restriction } from '@/lib/sybil/v2/restrictions';
import { getVeBetterNetwork } from '@/lib/vebetter/network';
import { getWalletSession } from '@/lib/walletAuthServer';

export const dynamic = 'force-dynamic';

function noStoreJson(
  body: Record<string, unknown>,
  status = 200,
) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export async function GET(request: NextRequest) {
  try {
    const session = await getWalletSession(request);

    if (!session) {
      return noStoreJson(
        {
          authenticated: false,
          restricted: false,
          restrictionKind: null,
          reviewPending: false,
        },
        401,
      );
    }

    const restriction = await loadActiveSybilV2Restriction({
      walletAddress: session.walletAddress,
      network: getVeBetterNetwork(),
    });

    if (!restriction) {
      return noStoreJson({
        authenticated: true,
        restricted: false,
        restrictionKind: null,
        reviewPending: false,
      });
    }

    const blacklisted =
      restriction.restriction_kind === 'BLACKLIST';

    return noStoreJson({
      authenticated: true,
      restricted: blacklisted,
      restrictionKind: blacklisted ? 'BLACKLIST' : null,
      reviewPending: !blacklisted,
    });
  } catch (error) {
    console.error('Failed to read VeInvite wallet restriction:', error);
    return noStoreJson(
      { error: 'Failed to verify VeInvite participation access.' },
      500,
    );
  }
}
