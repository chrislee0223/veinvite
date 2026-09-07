import {
  NextRequest,
  NextResponse,
} from 'next/server';

import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  requireWalletSession,
  WalletAuthenticationError,
} from '@/lib/walletAuthServer';

const COUNTRY_PATTERN = /^[A-Z]{2}$/;

function noStoreJson(
  body: Record<string, unknown>,
  status = 200,
) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}

function requestHasSameOrigin(
  request: NextRequest,
): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;

  try {
    return new URL(origin).origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}

export async function POST(
  request: NextRequest,
) {
  if (!requestHasSameOrigin(request)) {
    return noStoreJson(
      { error: 'Invalid request origin.' },
      403,
    );
  }

  try {
    const session = await requireWalletSession({ request });
    const rawCountry =
      request.headers
        .get('x-vercel-ip-country')
        ?.trim()
        .toUpperCase() ?? '';
    const trustedCountry = COUNTRY_PATTERN.test(rawCountry)
      ? rawCountry
      : null;
    const observedAt = new Date().toISOString();

    const { error } = await supabaseAdmin
      .from('wallet_auth_sessions')
      .update({
        country_code: trustedCountry ?? 'UNKNOWN',
        country_source: trustedCountry
          ? 'TRUSTED_EDGE'
          : 'UNKNOWN',
        country_observed_at: trustedCountry
          ? observedAt
          : null,
      })
      .eq('id', session.id)
      .eq('wallet_address', session.walletAddress);

    if (error) {
      throw new Error(
        `Wallet country observation save failed: ${error.message}`,
      );
    }

    return noStoreJson({ recorded: true });
  } catch (error) {
    if (error instanceof WalletAuthenticationError) {
      return noStoreJson(
        { error: error.message },
        error.status,
      );
    }

    console.error(
      'Failed to record VeInvite wallet country observation:',
      error,
    );
    return noStoreJson(
      { error: 'Wallet country observation could not be recorded.' },
      500,
    );
  }
}
