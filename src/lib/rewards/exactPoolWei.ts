// Exact 18-decimal token Wei must NEVER cross a JavaScript Number boundary.
// Postgres NUMERIC values must be converted to ::text in SQL before decoding.
export function parseExactPoolWei(value: unknown): string {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)$/.test(value)) {
    throw new Error('Invalid physical pool Wei');
  }
  return BigInt(value).toString();
}
