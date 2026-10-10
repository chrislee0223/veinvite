// Supplemental anti-abuse observation must not cause a verified session read
// or renewal to fail. Never include wallet addresses, tokens or proof material
// in its result.
export type ObservationResult = 'ok' | 'failed' | 'timed_out';

export async function settleOptionalSecurityObservation(
  operation: () => Promise<void>,
  timeoutMs = 1_200,
): Promise<ObservationResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race<ObservationResult>([
      Promise.resolve().then(operation).then(
        () => 'ok' as const,
        () => 'failed' as const,
      ),
      new Promise<ObservationResult>((resolve) => {
        timer = setTimeout(() => resolve('timed_out'), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
