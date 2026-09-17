type PostHogProperty = string | number | boolean;

type CapturePostHogEventInput = {
  distinctId: string;
  event: string;
  properties?: Record<string, PostHogProperty>;
  uuid?: string;
};

type PostHogConfig = {
  host: string;
  projectToken: string;
};

const POSTHOG_TIMEOUT_MS = 1_500;

function readPostHogConfig(): PostHogConfig | null {
  const projectToken = (process.env.POSTHOG_PROJECT_TOKEN ?? '').trim();
  const rawHost = (process.env.POSTHOG_HOST ?? '').trim();

  if (!projectToken || !rawHost) return null;

  try {
    const parsedHost = new URL(rawHost);
    if (parsedHost.protocol !== 'https:') return null;

    return {
      host: parsedHost.origin,
      projectToken,
    };
  } catch {
    return null;
  }
}

/**
 * Mirrors an already-accepted VeInvite analytics event into PostHog.
 *
 * Privacy rules:
 * - callers must pass the existing hashed anonymous visitor key, never a wallet
 *   address, invite code, auth token, email, or raw client identifier;
 * - person profiles are disabled because VeInvite only needs aggregate product
 *   analytics here;
 * - GeoIP is disabled because this request originates from the server and would
 *   otherwise resolve to the hosting provider rather than the end user;
 * - delivery is best-effort and must never change the product/API result.
 */
export async function capturePostHogEvent(
  input: CapturePostHogEventInput,
): Promise<boolean> {
  const config = readPostHogConfig();
  if (!config) return false;

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    POSTHOG_TIMEOUT_MS,
  );

  try {
    const response = await fetch(`${config.host}/batch/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      signal: controller.signal,
      body: JSON.stringify({
        api_key: config.projectToken,
        batch: [
          {
            ...(input.uuid ? { uuid: input.uuid } : {}),
            event: input.event,
            properties: {
              distinct_id: input.distinctId,
              $process_person_profile: false,
              $geoip_disable: true,
              $lib: 'veinvite-server',
              $lib_version: '1',
              ...(input.properties ?? {}),
            },
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    });

    if (!response.ok) {
      console.warn(
        `PostHog analytics delivery failed with status ${response.status}.`,
      );
      return false;
    }

    return true;
  } catch (error) {
    console.warn(
      'PostHog analytics delivery failed:',
      error instanceof Error ? error.message : 'unknown error',
    );
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
