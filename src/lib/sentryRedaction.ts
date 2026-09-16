const WALLET_ADDRESS = /0x[a-fA-F0-9]{40}/g;
const SENSITIVE_QUERY_VALUE = /([?&](?:code|invite|inviteCode|ref|referral)=)[^&#\s]*/gi;

export function redactSentryText(value: string): string {
  return value.replace(WALLET_ADDRESS, '[wallet]');
}

export function redactSentryUrl(value: string): string {
  return redactSentryText(value).replace(SENSITIVE_QUERY_VALUE, '$1[redacted]');
}
