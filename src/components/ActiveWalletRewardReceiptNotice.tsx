'use client';

import { useEffect, useState } from 'react';

import { PaidActivationLiveSync } from './PaidActivationLiveSync';
import { RewardReceiptNotice } from './RewardReceiptNotice';
import { useActiveWallet } from './WalletControl';

const APP_READY_EVENT = 'veinvite-app-ready';
const APP_LOADING_EVENT = 'veinvite-app-loading';

export function ActiveWalletRewardReceiptNotice() {
  const wallet = useActiveWallet();
  const [appReady, setAppReady] = useState(false);

  useEffect(() => {
    if (!wallet) {
      setAppReady(false);
      return;
    }

    const syncReadiness = () => {
      setAppReady(
        document.documentElement.dataset.veinviteAppReady === 'true',
      );
    };

    syncReadiness();
    window.addEventListener(APP_READY_EVENT, syncReadiness);
    window.addEventListener(APP_LOADING_EVENT, syncReadiness);

    return () => {
      window.removeEventListener(APP_READY_EVENT, syncReadiness);
      window.removeEventListener(APP_LOADING_EVENT, syncReadiness);
    };
  }, [wallet]);

  if (!wallet || !appReady) {
    return null;
  }

  const walletKey = wallet.toLowerCase();

  // Reward-receipt readers are intentionally non-critical startup work. Mount
  // them only after the authenticated Home has finished its own readiness gate,
  // so their receipt requests cannot compete with invite/link bootstrap. They
  // still remount on wallet changes to keep wallet-scoped baselines isolated.
  return (
    <>
      <PaidActivationLiveSync key={`paid-sync:${walletKey}`} />
      <RewardReceiptNotice key={`receipt:${walletKey}`} />
    </>
  );
}
