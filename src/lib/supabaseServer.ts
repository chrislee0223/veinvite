import 'server-only';

import { createClient } from '@supabase/supabase-js';

const PRODUCTION_SUPABASE_PROJECT_REF =
  'upfjvkidaqtnbmmnhupz';
const PREVIEW_SUPABASE_PROJECT_REF =
  'bpppslplhmppxzvdkwxs';
const JWT_FUTURE_RETRY_DELAY_MS = 750;
const RETRIABLE_READ_METHODS = new Set([
  'GET',
  'HEAD',
]);

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL;

const supabaseSecretKey =
  process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl) {
  throw new Error(
    'NEXT_PUBLIC_SUPABASE_URL is not configured.',
  );
}

if (!supabaseSecretKey) {
  throw new Error(
    'SUPABASE_SECRET_KEY is not configured.',
  );
}

function getSupabaseProjectRef(
  rawUrl: string,
): string {
  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL is not a valid URL.',
    );
  }

  if (
    url.protocol !== 'https:' ||
    !url.hostname.endsWith('.supabase.co')
  ) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL must use an HTTPS supabase.co host.',
    );
  }

  return url.hostname.split('.')[0] ?? '';
}

const configuredProjectRef =
  getSupabaseProjectRef(supabaseUrl);

function assertSafeDatabaseEnvironment() {
  const vercelEnvironment =
    process.env.VERCEL_ENV;

  if (vercelEnvironment === 'production') {
    if (
      configuredProjectRef !==
      PRODUCTION_SUPABASE_PROJECT_REF
    ) {
      throw new Error(
        'Production VeInvite is not connected to the reviewed production Supabase project.',
      );
    }

    return;
  }

  // Preview/local deployments must never read or mutate the production DB.
  // This fails at request time rather than build time so safe pure self-tests
  // can still run while the Vercel Preview environment is being corrected.
  if (
    configuredProjectRef ===
    PRODUCTION_SUPABASE_PROJECT_REF
  ) {
    throw new Error(
      'Non-production VeInvite cannot access the production Supabase project.',
    );
  }

  if (
    vercelEnvironment === 'preview' &&
    configuredProjectRef !==
      PREVIEW_SUPABASE_PROJECT_REF
  ) {
    throw new Error(
      'VeInvite Preview is not connected to the reviewed Preview Supabase project.',
    );
  }
}

function getRequestMethod(
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
): string {
  const configuredMethod =
    init?.method?.trim();

  if (configuredMethod) {
    return configuredMethod.toUpperCase();
  }

  if (input instanceof Request) {
    return input.method.toUpperCase();
  }

  return 'GET';
}

async function wait(
  milliseconds: number,
): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function hasJwtIssuedAtFuture(
  response: Response,
): Promise<boolean> {
  if (response.ok) {
    return false;
  }

  try {
    const body = await response.clone().text();
    return body.includes('JWT issued at future');
  } catch {
    return false;
  }
}

const guardedFetch: typeof fetch = async (
  input,
  init,
) => {
  assertSafeDatabaseEnvironment();

  const method = getRequestMethod(input, init);
  const response = await fetch(input, init);

  // Supabase can very occasionally reject a valid server-side JWT while
  // clocks are converging. Retry only an idempotent read, only once, and only
  // for the exact transient error. Mutations are never retried here.
  if (
    !RETRIABLE_READ_METHODS.has(method) ||
    !(await hasJwtIssuedAtFuture(response))
  ) {
    return response;
  }

  await wait(JWT_FUTURE_RETRY_DELAY_MS);
  assertSafeDatabaseEnvironment();
  return fetch(input, init);
};

export const supabaseAdmin = createClient(
  supabaseUrl,
  supabaseSecretKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      fetch: guardedFetch,
    },
  },
);
