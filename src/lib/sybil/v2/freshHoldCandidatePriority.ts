/**
 * Prefer genuinely new actionable HOLDs without stealing a priority slot
 * from a HOLD already present in the normal assessment candidate batch.
 *
 * Caller fetches at least (normalBatchLimit + min(2, normalBatchLimit))
 * ordered fresh rows: even if every ordinary candidate is also present in
 * the fresh view, this includes the first two genuinely new candidates.
 * Never mutates inputs, verdicts or a reward queue.
 */
export function prioritizeFreshHoldCandidates<T extends { invite_code: string }>(
  ordinary: readonly T[],
  fresh: readonly T[],
  limit: number,
): T[] {
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new Error('Invalid Sybil assessment batch size.');
  }

  const ordinaryBatch = ordinary.slice(0, limit);
  const existing = new Set(
    ordinaryBatch.map((row) => String(row.invite_code)),
  );
  const prioritized: T[] = [];
  const prioritizedCodes = new Set<string>();
  const reserved = Math.min(2, limit);

  for (const row of fresh) {
    if (prioritized.length >= reserved) break;
    const code = String(row.invite_code ?? '');
    if (!code || existing.has(code) || prioritizedCodes.has(code)) {
      continue;
    }
    prioritized.push(row);
    prioritizedCodes.add(code);
  }

  return [
    ...prioritized,
    ...ordinaryBatch.slice(0, limit - prioritized.length),
  ];
}
