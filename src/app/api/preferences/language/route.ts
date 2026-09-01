import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  isLocale,
} from '@/lib/i18n/locales';
import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  requireWalletSession,
  WalletAuthenticationError,
} from '@/lib/walletAuthServer';

const SET_LANGUAGE_INTENT =
  'SET_WALLET_LANGUAGE_PREFERENCE';

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

  if (!origin) {
    return false;
  }

  try {
    return (
      new URL(origin).origin ===
      request.nextUrl.origin
    );
  } catch {
    return false;
  }
}

function authErrorResponse(error: unknown) {
  if (
    error instanceof WalletAuthenticationError
  ) {
    return noStoreJson(
      { error: error.message },
      error.status,
    );
  }

  return null;
}

async function readPreference(
  walletAddress: string,
) {
  const { data, error } = await supabaseAdmin
    .from('wallet_preferences')
    .select('language, updated_at')
    .eq('wallet_address', walletAddress)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Wallet preference lookup failed: ${error.message}`,
    );
  }

  return data;
}

export async function GET(
  request: NextRequest,
) {
  try {
    const session =
      await requireWalletSession({ request });
    const walletAddress =
      session.walletAddress.toLowerCase();
    const preference =
      await readPreference(walletAddress);

    return noStoreJson({
      walletAddress,
      language:
        preference && isLocale(preference.language)
          ? preference.language
          : null,
      updatedAt:
        preference?.updated_at ?? null,
    });
  } catch (error) {
    const authResponse =
      authErrorResponse(error);

    if (authResponse) {
      return authResponse;
    }

    console.error(
      'Failed to read VeInvite wallet language preference:',
      error,
    );

    return noStoreJson(
      {
        error:
          'VeInvite language preference could not be checked.',
      },
      500,
    );
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

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return noStoreJson(
      { error: 'Invalid JSON body.' },
      400,
    );
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    !('intent' in body) ||
    body.intent !== SET_LANGUAGE_INTENT
  ) {
    return noStoreJson(
      {
        error:
          `intent must be ${SET_LANGUAGE_INTENT}.`,
      },
      400,
    );
  }

  const language =
    'language' in body
      ? body.language
      : null;

  if (!isLocale(language)) {
    return noStoreJson(
      { error: 'Unsupported language.' },
      400,
    );
  }

  try {
    const session =
      await requireWalletSession({ request });
    const walletAddress =
      session.walletAddress.toLowerCase();
    const updatedAt =
      new Date().toISOString();

    const { error } = await supabaseAdmin
      .from('wallet_preferences')
      .upsert(
        {
          wallet_address: walletAddress,
          language,
          updated_at: updatedAt,
        },
        {
          onConflict: 'wallet_address',
        },
      );

    if (error) {
      throw new Error(
        `Wallet preference save failed: ${error.message}`,
      );
    }

    return noStoreJson({
      walletAddress,
      language,
      updatedAt,
    });
  } catch (error) {
    const authResponse =
      authErrorResponse(error);

    if (authResponse) {
      return authResponse;
    }

    console.error(
      'Failed to save VeInvite wallet language preference:',
      error,
    );

    return noStoreJson(
      {
        error:
          'VeInvite language preference could not be saved.',
      },
      500,
    );
  }
}
