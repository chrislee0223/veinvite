/**
 * Bound the time spent waiting for an optional first-render value.
 *
 * A slow prefill must not hold back the page's required session bootstrap.
 * Deliberately do not cancel `task`: it may still populate the shared
 * read-through cache, while the client obtains a fresh value separately.
 */
export async function resolveOptionalPrefillWithin<T>(
  task: Promise<T>,
  fallback: T,
  maxWaitMs: number,
): Promise<T> {
  if (!Number.isFinite(maxWaitMs) || maxWaitMs < 0) {
    throw new RangeError('The optional prefill budget must be non-negative.');
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      task,
      new Promise<T>((resolve) => {
        timeoutId = setTimeout(() => resolve(fallback), maxWaitMs);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}
