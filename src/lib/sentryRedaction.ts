const WALLET_ADDRESS = /0x[a-fA-F0-9]{40}/g;
const SENSITIVE_QUERY_VALUE = /([?&](?:code|invite|inviteCode|ref|referral)=)[^&#\s]*/gi;
const SENSITIVE_PATH_VALUE = /(\/(?:i|r|api\/invites|api\/referral-links)\/)[^/?#\s]+/gi;
const SENSITIVE_FIELD_NAME = /(?:wallet|address|invite.?code|referral.?key|tx.?id|authorization|cookie|token|signature|secret)/i;

export function redactSentryText(value: string): string {
  return value.replace(WALLET_ADDRESS, '[wallet]');
}

export function redactSentryUrl(value: string): string {
  return redactSentryText(value)
    .replace(SENSITIVE_QUERY_VALUE, '$1[redacted]')
    .replace(SENSITIVE_PATH_VALUE, '$1[redacted]');
}

export function redactSentryValue(
  value: unknown,
  fieldName = '',
  depth = 0,
): unknown {
  if (SENSITIVE_FIELD_NAME.test(fieldName)) {
    return '[redacted]';
  }

  if (typeof value === 'string') {
    return redactSentryUrl(value);
  }

  if (value === null || value === undefined || depth >= 6) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redactSentryValue(entry, '', depth + 1));
  }

  if (typeof value === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      sanitized[key] = redactSentryValue(entry, key, depth + 1);
    }
    return sanitized;
  }

  return value;
}
