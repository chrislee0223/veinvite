import { cookies } from 'next/headers';

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
};

/**
 * Direct referral routes do not render through Home, so they need their own
 * server-side session bootstrap. Supplying the already verified wallet keeps
 * WalletSessionGate stable while the client wallet provider restores.
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
          'Failed to bootstrap direct-referral wallet session:',
          error,
        );
        return null;
      },
    );
  const initialSessionWallet =
    initialSession?.walletAddress ?? null;

  const initialRestriction = initialSessionWallet
    ? await loadActiveSybilV2Restriction({
        walletAddress: initialSessionWallet,
        network: getVeBetterNetwork(),
      }).catch((error) => {
        console.error(
          'Failed to bootstrap direct-referral participation restriction:',
          error,
        );
        return null;
      })
    : null;

  return {
    initialSessionWallet,
    initialRestrictionKind:
      initialRestriction?.restriction_kind ?? null,
  };
}
