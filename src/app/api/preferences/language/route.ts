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
const OBSERVE_DISPLAY_LANGUAGE_INTENT =
  'OBSERVE_WALLET_DISPLAY_LANGUAGE';

const LANGUAGE_USAGE_SOURCES = [
  'browser_auto',
  'local_storage',
  'wallet_preference',
  'manual_selection',
] as const;

type LanguageUsageSource =
  (typeof LANGUAGE_USAGE_SOURCES)[number];

function isLanguageUsageSource(
  value: unknown,
): value is LanguageUsageSource {
  return (
    typeof value === 'string' &&
    LANGUAGE_USAGE_SOURCES.includes(
      value as LanguageUsageSource,
    )
  );
}

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

async function readLanguageUsage(
  walletAddress: string,
) {
  const { data, error } = await supabaseAdmin
    .from('wallet_language_usage')
    .select(
      'current_language, current_source, first_observed_at, last_observed_at',
    )
    .eq('wallet_address', walletAddress)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Wallet display language lookup failed: ${error.message}`,
    );
  }

  return data;
}

async function recordLanguageUsage({
  walletAddress,
  language,
  source,
  observedAt,
}: {
  walletAddress: string;
  language: string;
  source: LanguageUsageSource;
  observedAt: string;
}) {
  const { error } = await supabaseAdmin
    .from('wallet_language_usage')
    .upsert(
      {
        wallet_address: walletAddress,
        current_language: language,
        current_source: source,
        last_observed_at: observedAt,
        updated_at: observedAt,
      },
      {
        onConflict: 'wallet_address',
      },
    );

  if (error) {
    throw new Error(
      `Wallet display language save failed: ${error.message}`,
    );
  }
}

export async function GET(
  request: NextRequest,
) {
  try {
    const session =
      await requireWalletSession({ request });
    const walletAddress =
      session.walletAddress.toLowerCase();
    const [preference, usage] =
      await Promise.all([
        readPreference(walletAddress),
        readLanguageUsage(walletAddress),
      ]);

    return noStoreJson({
      walletAddress,
      language:
        preference && isLocale(preference.language)
          ? preference.language
          : null,
      updatedAt:
        preference?.updated_at ?? null,
      displayLanguage:
        usage && isLocale(usage.current_language)
          ? usage.current_language
          : null,
      displayLanguageSource:
        usage &&
        isLanguageUsageSource(usage.current_source)
          ? usage.current_source
          : null,
      displayLanguageFirstObservedAt:
        usage?.first_observed_at ?? null,
      displayLanguageLastObservedAt:
        usage?.last_observed_at ?? null,
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
    (
      body.intent !== SET_LANGUAGE_INTENT &&
      body.intent !== OBSERVE_DISPLAY_LANGUAGE_INTENT
    )
  ) {
    return noStoreJson(
      {
        error:
          `intent must be ${SET_LANGUAGE_INTENT} or ${OBSERVE_DISPLAY_LANGUAGE_INTENT}.`,
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

  const requestedSource =
    'source' in body
      ? body.source
      : null;

  if (
    body.intent === SET_LANGUAGE_INTENT &&
    requestedSource !== 'manual_selection'
  ) {
    return noStoreJson(
      {
        error:
          'Wallet language preference can only be set by an explicit language selection.',
      },
      400,
    );
  }

  if (
    body.intent === OBSERVE_DISPLAY_LANGUAGE_INTENT &&
    !isLanguageUsageSource(requestedSource)
  ) {
    return noStoreJson(
      { error: 'Unsupported language source.' },
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

    if (body.intent === SET_LANGUAGE_INTENT) {
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

      await recordLanguageUsage({
        walletAddress,
        language,
        source: 'manual_selection',
        observedAt: updatedAt,
      });

      return noStoreJson({
        walletAddress,
        language,
        updatedAt,
        displayLanguage: language,
        displayLanguageSource:
          'manual_selection',
        displayLanguageLastObservedAt: updatedAt,
      });
    }

    const source =
      requestedSource as LanguageUsageSource;

    await recordLanguageUsage({
      walletAddress,
      language,
      source,
      observedAt: updatedAt,
    });

    return noStoreJson({
      walletAddress,
      displayLanguage: language,
      displayLanguageSource: source,
      displayLanguageLastObservedAt: updatedAt,
    });
  } catch (error) {
    const authResponse =
      authErrorResponse(error);

    if (authResponse) {
      return authResponse;
    }

    console.error(
      'Failed to save VeInvite wallet language state:',
      error,
    );

    return noStoreJson(
      {
        error:
          'VeInvite language state could not be saved.',
      },
      500,
    );
  }
}
