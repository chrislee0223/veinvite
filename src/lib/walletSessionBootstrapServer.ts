import { cookies } from 'next/headers';

import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
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

export type InitialLegalConsentStatus =
  | 'accepted'
  | 'missing'
  | null;

export type WalletSessionBootstrap = {
  initialSessionWallet: string | null;
  initialRestrictionKind:
    | ActiveSybilV2Restriction['restriction_kind']
    | null;
  initialLegalConsentStatus: InitialLegalConsentStatus;
};

async function readInitialLegalConsentStatus(
  walletAddress: string,
): Promise<Exclude<InitialLegalConsentStatus, null>> {
  const { data, error } = await supabaseAdmin
    .from('wallet_legal_consents')
    .select('accepted_at')
    .eq('wallet_address', walletAddress.toLowerCase())
    .eq('terms_version', CURRENT_TERMS_VERSION)
    .eq('privacy_version', CURRENT_PRIVACY_VERSION)
    .maybeSingle();

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
export async function readWalletSessionBootstrap():
  Promise<WalletSessionBootstrap> {
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
    await getWalletSessionFromTokens(sessionTokens).catch(
      (error) => {
        console.error(
          'Failed to bootstrap VeInvite wallet session:',
          error,
        );
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

  const [initialRestriction, initialLegalConsentStatus] =
    await Promise.all([
      loadActiveSybilV2Restriction({
        walletAddress: initialSessionWallet,
        network: getVeBetterNetwork(),
      }).catch((error) => {
        console.error(
          'Failed to bootstrap VeInvite participation restriction:',
          error,
        );
        return null;
      }),
      readInitialLegalConsentStatus(
        initialSessionWallet,
      ).catch((error) => {
        console.error(
          'Failed to bootstrap VeInvite legal consent:',
          error,
        );
        return null;
      }),
    ]);

  return {
    initialSessionWallet,
    initialRestrictionKind:
      initialRestriction?.restriction_kind ?? null,
    initialLegalConsentStatus,
  };
}
