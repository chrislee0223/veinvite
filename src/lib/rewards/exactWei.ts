/**
 * PostgREST serializes PostgreSQL numeric as a JSON number by default.
 * Large B3TR Wei values lose precision during JSON.parse even before
 * application code calls String(value) or BigInt(value).
 *
 * Use a PostgREST select cast (amount_wei::text) at the source, then fail
 * closed if the result is not an exact canonical decimal string. Never
 * reconstruct a Wei balance from a JavaScript number.
 */
export function exactWeiFromDb(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return /^(?:0|[1-9]\d*)$/u.test(value) ? value : null;
}
