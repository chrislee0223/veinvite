export function requestInviteWalletSessionRecovery(): void {
  window.dispatchEvent(new Event('veinvite-wallet-session-invalid'));
}

export function shortInviteWalletAddress(address: string): string {
  return `${address.slice(0, 8)}···${address.slice(-6)}`;
}
