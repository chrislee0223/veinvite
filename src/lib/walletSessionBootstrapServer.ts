import { cookies } from 'next/headers';

import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
  type InitialLegalConsentStatus,
} from '@/lib/legalConsent';
import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  loadActiveSybilV2Restriction,
  type ActiveSybilV2Restriction,
} from '@/lib/sybil/v2/restrictions';
import { getVeBetterNetwork } from '@/lib/vebetter/network';
import {
  getWalletSessionFromTokens,
  LEGACY_WALLET_SESSION_COOKIE_NAME,
  WALLET_SESSION_COOKIE_NAME,
} from '@/lib/walletAuthServer';

export type WalletSessionBootstrap = {
  initialSessionWallet: string | null;
  initialRestrictionKind:
    | ActiveSybilV2Restriction['restriction_kind']
    | null;
  initialLegalConsentStatus: InitialLegalConsentStatus;
};

async function readInitialLegalConsentStatus(
  walletAddress: string,
  signal?: AbortSignal,
): Promise<Exclude<InitialLegalConsentStatus, null>> {
  const query = supabaseAdmin
    .from('wallet_legal_consents')
    .select('accepted_at')
    .eq('wallet_address', walletAddress.toLowerCase())
    .eq('terms_version', CURRENT_TERMS_VERSION)
    .eq('privacy_version', CURRENT_PRIVACY_VERSION);
  const { data, error } = await (
    signal ? query.abortSignal(signal) : query
  ).maybeSingle();

  if (error) {
    throw new Error(
      `Legal consent bootstrap failed: ${error.message}`,
    );
  }

  return data ? 'accepted' : 'missing';
}

/**
 * Server-side startup bootstrap shared by Home and direct referral routes.
 * Session validation stays authoritative, while restriction and current legal
 * consent are resolved in parallel once the wallet session is known.
 */
export async function readWalletSessionBootstrap(
  signal?: AbortSignal,
): Promise<WalletSessionBootstrap> {
  const cookieStore = await cookies();
  const cookieNames = Array.from(
    new Set([
      WALLET_SESSION_COOKIE_NAME,
      LEGACY_WALLET_SESSION_COOKIE_NAME,
    ]),
  );
  const sessionTokens = cookieNames.flatMap(
    (name) =>
      cookieStore
        .getAll(name)
        .map((cookie) => cookie.value),
  );

  const initialSession =
    await getWalletSessionFromTokens(sessionTokens, signal).catch(
      (error) => {
        if (!signal?.aborted) {
          console.error(
            'Failed to bootstrap VeInvite wallet session:',
            error,
          );
        }
        return null;
      },
    );
  const initialSessionWallet =
    initialSession?.walletAddress ?? null;

  if (!initialSessionWallet) {
    return {
      initialSessionWallet: null,
      initialRestrictionKind: null,
      initialLegalConsentStatus: null,
    };
  }

  const [restrictionResult, consentResult] =
    await Promise.allSettled([
      loadActiveSybilV2Restriction({
        walletAddress: initialSessionWallet,
        network: getVeBetterNetwork(),
        signal,
      }),
      readInitialLegalConsentStatus(
        initialSessionWallet,
        signal,
      ),
    ]);

  // Do not treat a failed restriction/consent lookup as an absence of
  // restrictions or an accepted legal agreement. Keep the initial wallet
  // unverified, so the client must repeat the authoritative checks.
  if (
    restrictionResult.status === 'rejected' ||
    consentResult.status === 'rejected' ||
    signal?.aborted
  ) {
    // A cancelled optional first-render lookup is expected during a DB outage;
    // only unexpected failures should produce a production error alert.
    if (!signal?.aborted) {
      if (restrictionResult.status === 'rejected') {
        console.error(
          'Failed to bootstrap VeInvite participation restriction:',
          restrictionResult.reason,
        );
      }
      if (consentResult.status === 'rejected') {
        console.error(
          'Failed to bootstrap VeInvite legal consent:',
          consentResult.reason,
        );
      }
    }
    return {
      initialSessionWallet: null,
      initialRestrictionKind: null,
      initialLegalConsentStatus: null,
    };
  }

  return {
    initialSessionWallet,
    initialRestrictionKind:
      restrictionResult.value?.restriction_kind ?? null,
    initialLegalConsentStatus: consentResult.value,
  };
}

const FIRST_RENDER_BOOTSTRAP_BUDGET_MS = 3_500;

/**
 * Keep public Home and invite pages responsive during Supabase outages.
 * A timed-out read is aborted, never accepted as wallet authorization.
 * The browser's strict wallet/session gate remains responsible for retrying.
 * This fallback does not change or revoke the user's session cookie.
 */
export async function readWalletSessionBootstrapForFirstPaint():
  Promise<WalletSessionBootstrap> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    FIRST_RENDER_BOOTSTRAP_BUDGET_MS,
  );
  try {
    const bootstrap = await readWalletSessionBootstrap(controller.signal);
    if (!controller.signal.aborted) return bootstrap;
  } catch (error) {
    if (!controller.signal.aborted) throw error;
  } finally {
    clearTimeout(timer);
  }
  return {
    initialSessionWallet: null,
    initialRestrictionKind: null,
    initialLegalConsentStatus: null,
  };
}
