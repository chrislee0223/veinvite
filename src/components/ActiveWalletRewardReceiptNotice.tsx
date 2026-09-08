'use client';

import { PaidActivationLiveSync } from './PaidActivationLiveSync';
import { RewardReceiptNotice } from './RewardReceiptNotice';
import { useActiveWallet } from './WalletControl';

export function ActiveWalletRewardReceiptNotice() {
  const wallet = useActiveWallet();

  if (!wallet) {
    return null;
  }

  const walletKey = wallet.toLowerCase();

  // Remount wallet-bound readers when VeChainKit switches accounts so the new
  // wallet starts with a clean receipt baseline and fresh receipt query.
  return (
    <>
      <PaidActivationLiveSync key={`paid-sync:${walletKey}`} />
      <RewardReceiptNotice key={`receipt:${walletKey}`} />
    </>
  );
}
