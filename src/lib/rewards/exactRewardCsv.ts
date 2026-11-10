// PostgREST JSON numbers lose precision above Number.MAX_SAFE_INTEGER.
// Read the fixed, server-only CSV projection to preserve every B3TR Wei digit.
export function parseExactRewardCsv(
  data: unknown,
  columns: readonly string[],
): Map<string, Record<string, string | null>> {
  if (typeof data !== 'string' || columns.length < 2 ||
      columns[0] !== 'invite_code') {
    throw new Error('Exact reward CSV is unavailable.');
  }
  // These selected fields can only contain invite codes, integers or null.
  // Delimiters and embedded quotes are never valid field content.
  const parseFields = (line: string) =>
    line.split(',').map((raw) => {
      const quoted = /^"([^"]*)"$/u.exec(raw);
      return quoted ? quoted[1] : raw;
    });
  const lines = data.trimEnd().split(/\r?\n/u);
  if (parseFields(lines[0]).join(',') !== columns.join(',')) {
    throw new Error('Unexpected exact reward CSV columns.');
  }
  const rows = new Map<string, Record<string, string | null>>();
  for (const line of lines.slice(1)) {
    const fields = parseFields(line);
    if (fields.length !== columns.length) {
      throw new Error('Malformed exact reward CSV row.');
    }
    const inviteCode = fields[0];
    if (!/^[a-zA-Z0-9_-]{1,64}$/u.test(inviteCode) || rows.has(inviteCode)) {
      throw new Error('Invalid or duplicate exact reward CSV invite.');
    }
    const amounts: Record<string, string | null> = {};
    for (let index = 1; index < columns.length; index += 1) {
      const amount = fields[index];
      if (amount !== '' && !/^(0|[1-9]\d*)$/u.test(amount)) {
        throw new Error('Invalid exact reward CSV Wei amount.');
      }
      amounts[columns[index]] = amount === '' ? null : amount;
    }
    rows.set(inviteCode, amounts);
  }
  return rows;
}
