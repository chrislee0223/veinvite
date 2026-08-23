import { createClient } from '@supabase/supabase-js';

const PRODUCTION_SUPABASE_PROJECT_REF =
  'upfjvkidaqtnbmmnhupz';
const PREVIEW_SUPABASE_PROJECT_REF =
  'bpppslplhmppxzvdkwxs';

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

const guardedFetch: typeof fetch = async (
  input,
  init,
) => {
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
