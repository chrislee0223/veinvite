export function shortWallet(wallet: string): string {
  if (wallet.length < 12) return wallet;
  return `${wallet.slice(0, 6)}…${wallet.slice(-4).toUpperCase()}`;
}

export function nodeWallet(wallet: string): string {
  if (wallet.length < 10) return wallet;
  return `0x${wallet.slice(2, 5).toUpperCase()}…${wallet.slice(-3).toUpperCase()}`;
}

export function triggerHoldHaptic() {
  if (
    typeof navigator === 'undefined' ||
    typeof navigator.vibrate !== 'function'
  ) {
    return;
  }

  try {
    navigator.vibrate(12);
  } catch {
    // Haptics are optional and unsupported browsers should stay silent.
  }
}

export function defaultGroupMemberOffset(index: number, count: number) {
  const safeCount = Math.max(1, count);
  const span = Math.min(310, Math.max(90, (safeCount - 1) * 76));
  const ratio = safeCount <= 1 ? 0.5 : index / (safeCount - 1);

  return {
    x: -span / 2 + span * ratio,
    y: 112 + Math.min(26, Math.abs(index - (safeCount - 1) / 2) * 6),
  };
}

export function edgePath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const bend =
    Math.sign(dx || 1) * Math.min(58, Math.abs(dx) * 0.16);

  return `M ${x1} ${y1} C ${x1 + bend} ${y1 + dy * 0.22}, ${x2 - bend} ${y1 + dy * 0.78}, ${x2} ${y2}`;
}
