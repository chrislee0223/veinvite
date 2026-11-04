// Retry policy for the STABLE/read-only X promotion shadow audit RPC only.
// Do not reuse for shadow synchronization, leases, reservations, Sybil or payout.
export type XPromotionAuditReadResponse = {
  status: number;
  error: { message: string } | null;
};

const RETRY_DELAY_MS = 250;
const RETRIABLE_HTTP_STATUSES = new Set([502, 503, 504]);

function isTransientTransportError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /fetch failed|network|ECONNRESET|ETIMEDOUT|TimeoutError|AbortError|aborted due to timeout/iu
    .test(`${error.name}: ${error.message}`);
}

function isTransientAuditResponse(response: XPromotionAuditReadResponse): boolean {
  if (!response.error) return false;
  if (RETRIABLE_HTTP_STATUSES.has(response.status)) return true;
  return response.status === 0 &&
    /fetch failed|network|ECONNRESET|ETIMEDOUT|timeout|abort|502 Bad Gateway|503 Service Unavailable|504 Gateway Timeout/iu
      .test(response.error.message);
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

// At most two attempts. A successful response with ok:false (invariant
// mismatch) is intentionally NOT retried, nor are auth/configuration errors.
export async function retryTransientXPromotionAuditRead<
  T extends XPromotionAuditReadResponse,
>(
  readOnce: () => Promise<T>,
  sleep: (milliseconds: number) => Promise<void> = wait,
): Promise<T> {
  let response: T;
  try {
    response = await readOnce();
  } catch (error) {
    if (!isTransientTransportError(error)) throw error;
    await sleep(RETRY_DELAY_MS);
    return readOnce();
  }

  if (!isTransientAuditResponse(response)) return response;
  await sleep(RETRY_DELAY_MS);
  return readOnce();
}
