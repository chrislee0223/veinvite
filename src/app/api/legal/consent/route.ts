import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
  LEGAL_CONSENT_INTENT,
  type LegalConsentSource,
} from '@/lib/legalConsent';
import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  requireWalletSession,
  WalletAuthenticationError,
} from '@/lib/walletAuthServer';

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

async function readCurrentConsent(
  walletAddress: string,
) {
  const { data, error } = await supabaseAdmin
    .from('wallet_legal_consents')
    .select('accepted_at, acceptance_source')
    .eq('wallet_address', walletAddress)
    .eq('terms_version', CURRENT_TERMS_VERSION)
    .eq('privacy_version', CURRENT_PRIVACY_VERSION)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Legal consent lookup failed: ${error.message}`,
    );
  }

  return data;
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

export async function GET(
  request: NextRequest,
) {
  try {
    const session =
      await requireWalletSession({ request });
    const walletAddress =
      session.walletAddress.toLowerCase();
    const consent =
      await readCurrentConsent(walletAddress);

    return noStoreJson({
      accepted: Boolean(consent),
      walletAddress,
      termsVersion: CURRENT_TERMS_VERSION,
      privacyVersion: CURRENT_PRIVACY_VERSION,
      acceptedAt:
        consent?.accepted_at ?? null,
    });
  } catch (error) {
    const authResponse =
      authErrorResponse(error);

    if (authResponse) {
      return authResponse;
    }

    console.error(
      'Failed to read VeInvite legal consent:',
      error,
    );

    return noStoreJson(
      {
        error:
          'VeInvite legal consent could not be checked.',
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
    body.intent !== LEGAL_CONSENT_INTENT
  ) {
    return noStoreJson(
      {
        error:
          `intent must be ${LEGAL_CONSENT_INTENT}.`,
      },
      400,
    );
  }

  const rawSource =
    'source' in body
      ? body.source
      : 'ui';
  const source: LegalConsentSource | null =
    rawSource === 'ui' ||
    rawSource === 'legacy-local-storage'
      ? rawSource
      : null;

  if (!source) {
    return noStoreJson(
      { error: 'Invalid consent source.' },
      400,
    );
  }

  try {
    const session =
      await requireWalletSession({ request });
    const walletAddress =
      session.walletAddress.toLowerCase();

    const { error } = await supabaseAdmin
      .from('wallet_legal_consents')
      .upsert(
        {
          wallet_address: walletAddress,
          terms_version:
            CURRENT_TERMS_VERSION,
          privacy_version:
            CURRENT_PRIVACY_VERSION,
          acceptance_source: source,
        },
        {
          onConflict:
            'wallet_address,terms_version,privacy_version',
          ignoreDuplicates: true,
        },
      );

    if (error) {
      throw new Error(
        `Legal consent save failed: ${error.message}`,
      );
    }

    const consent =
      await readCurrentConsent(walletAddress);

    if (!consent) {
      throw new Error(
        'Legal consent was not persisted.',
      );
    }

    return noStoreJson({
      accepted: true,
      walletAddress,
      termsVersion: CURRENT_TERMS_VERSION,
      privacyVersion: CURRENT_PRIVACY_VERSION,
      acceptedAt: consent.accepted_at,
    });
  } catch (error) {
    const authResponse =
      authErrorResponse(error);

    if (authResponse) {
      return authResponse;
    }

    console.error(
      'Failed to save VeInvite legal consent:',
      error,
    );

    return noStoreJson(
      {
        error:
          'VeInvite legal consent could not be saved.',
      },
      500,
    );
  }
}
