export function pendingAgeWeights(createdAt: string, nowMs: number): {
  expectedBps: number;
  stressBps: number;
  bucket: 'fresh' | 'aging' | 'stale' | 'old';
} {
  const createdMs = Date.parse(createdAt);
  if (Number.isNaN(createdMs)) return { expectedBps: 50, stressBps: 150, bucket: 'old' };
  const ageHours = Math.max(0, (nowMs - createdMs) / 3_600_000);
  // Do not change invitation status; aged unaccepted invitations are forecast-only noise.
  if (ageHours > 30 * 24) return { expectedBps: 0, stressBps: 0, bucket: 'old' };
  if (ageHours <= 24) return { expectedBps: 500, stressBps: 1_000, bucket: 'fresh' };
  if (ageHours <= 72) return { expectedBps: 300, stressBps: 700, bucket: 'aging' };
  if (ageHours <= 168) return { expectedBps: 150, stressBps: 400, bucket: 'stale' };
  return { expectedBps: 50, stressBps: 150, bucket: 'old' };
}

