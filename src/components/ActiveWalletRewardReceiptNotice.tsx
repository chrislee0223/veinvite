'use client';

import { RewardReceiptNotice } from './RewardReceiptNotice';
import { useActiveWallet } from './WalletControl';

export function ActiveWalletRewardReceiptNotice() {
  const wallet = useActiveWallet();

  if (!wallet) {
    return null;
  }

  // Remount the receipt reader when VeChainKit switches accounts so the new
  // wallet gets a fresh wallet-bound receipt query immediately.
  return <RewardReceiptNotice key={wallet.toLowerCase()} />;
}
