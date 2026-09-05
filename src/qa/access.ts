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
  if (process.env.VEINVITE_QA_STUDIO !== 'true') {
    return false;
  }

  // The dedicated QA Vercel project runs main as a protected Preview on Hobby.
  // Treat every Preview deployment carrying the explicit QA marker as dedicated
  // so inherited application APIs are blocked even on deployment-specific URLs.
  if (process.env.VERCEL_ENV === 'preview') {
    return true;
  }

  return (
    process.env.VERCEL_ENV === 'production' &&
    isQaStudioAccessAllowed(requestHost)
  );
}
