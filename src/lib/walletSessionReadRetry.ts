// Retry only transient GET /api/auth/session transport errors. A 200
// "authenticated: false" response is authoritative and never retried here;
// neither a rejected signature nor a wallet mismatch is retryable.
const RETRY_DELAY_MS = 180;

export function isTransientWalletSessionStatus(status: number): boolean {
  return status === 500 || status === 502 || status === 503 || status === 504;
}

function waitForTransientRetry(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Wallet session check was cancelled.', 'AbortError'));
      return;
    }

    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Wallet session check was cancelled.', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, RETRY_DELAY_MS);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export async function fetchWalletSessionWithTransientRetry({
  fetchSession,
  signal,
}: {
  fetchSession: () => Promise<Response>;
  signal: AbortSignal;
}): Promise<Response> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (signal.aborted) {
      throw new DOMException('Wallet session check was cancelled.', 'AbortError');
    }

    let response: Response;
    try {
      response = await fetchSession();
    } catch (error) {
      // Only fetch transport failures can be retried. Never retry an
      // aborted request, wallet-provider error or signing rejection.
      if (attempt !== 0 || signal.aborted || !(error instanceof TypeError)) {
        throw error;
      }
      await waitForTransientRetry(signal);
      continue;
    }

    if (attempt === 0 && isTransientWalletSessionStatus(response.status)) {
      await waitForTransientRetry(signal);
      continue;
    }

    return response;
  }

  throw new Error('Wallet session lookup did not return a response.');
}
