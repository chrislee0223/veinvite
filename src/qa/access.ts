function normalizeHost(value: string | null | undefined): string | null {
  if (!value) return null;

  const first = value.split(',')[0]?.trim().toLowerCase();
  if (!first) return null;

  const withoutPort = first.replace(/:\d+$/, '');
  return withoutPort.replace(/\.$/, '');
}

export function isQaStudioAccessAllowed(
  requestHost?: string | null,
): boolean {
  if (
    process.env.NODE_ENV === 'development' ||
    process.env.VERCEL_ENV === 'preview'
  ) {
    return true;
  }

  if (process.env.VEINVITE_QA_STUDIO !== 'true') {
    return false;
  }

  const expectedHost = normalizeHost(
    process.env.VEINVITE_QA_HOST,
  );
  const actualHost = normalizeHost(requestHost);

  return Boolean(
    expectedHost &&
      actualHost &&
      expectedHost === actualHost,
  );
}

export function isDedicatedQaHost(
  requestHost?: string | null,
): boolean {
  return (
    process.env.VERCEL_ENV === 'production' &&
    process.env.VEINVITE_QA_STUDIO === 'true' &&
    isQaStudioAccessAllowed(requestHost)
  );
}
