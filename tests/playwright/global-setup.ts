const QA_BASE_URL = 'http://127.0.0.1:3100';

async function warm(path: string): Promise<void> {
  const response = await fetch(`${QA_BASE_URL}${path}`, {
    signal: AbortSignal.timeout(30_000),
    headers: {
      Accept: 'text/html',
    },
  });

  if (!response.ok) {
    throw new Error(
      `Playwright QA warmup failed for ${path}: HTTP ${response.status}`,
    );
  }

  await response.text();
}

export default async function globalSetup(): Promise<void> {
  // Playwright's webServer readiness probe already warms /qa/render. Warm the
  // heavier production-state route as well before parallel workers start so a
  // one-time Next.js development compile cannot masquerade as an Arabic/RTL
  // layout failure on the first four tests.
  await warm('/qa/render?scenario=invite-landing-ko-mobile&locale=en');
  await warm('/qa/state?state=LEGAL-REQUIRED&locale=en');
}
