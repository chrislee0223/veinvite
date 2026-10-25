/**
 * Read-only shadow of the destination's next-cohort release ceiling.
 * Does not allocate, reserve, advertise or pay B3TR.
 */
export function simulateFutureCohortAdaptiveRelease(i: {
  enabled: boolean;
  policyVersion: string;
  activeCount: number;
  freshWei: string;
  bankWei: string;
  stressReserveWei: string;
  physicalHeadroomWei: string;
}) {
  if (!Number.isSafeInteger(i.activeCount) || i.activeCount < 0)
    throw new Error('Invalid active count');
  const parse = (s: string): bigint => {
    if (!/^\d+$/.test(s)) throw new Error('Invalid Wei');
    return BigInt(s);
  };
  const fresh = parse(i.freshWei);
  const bank = parse(i.bankWei);
  const stress = parse(i.stressReserveWei);
  const physical = parse(i.physicalHeadroomWei);
  const bps = i.enabled && i.policyVersion === 'reward-boost-reserve-v2-adaptive'
    ? i.activeCount <= 1 ? 15000 : i.activeCount <= 3 ? 12500 : 10000
    : 10000;
  const available = bank > stress ? bank - stress : 0n;
  const release = [fresh * BigInt(bps) / 10000n, available, physical]
    .reduce((a, b) => a < b ? a : b);
  return { shadowOnly: true, bps, releaseWei: release.toString(), afterBankWei: (bank-release).toString() };
}
