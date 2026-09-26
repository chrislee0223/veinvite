import {
  NextRequest,
  NextResponse,
} from 'next/server';
import { createClient } from '@supabase/supabase-js';

const PREVIEW_SUPABASE_PROJECT_REF =
  'bpppslplhmppxzvdkwxs';

function noStoreHeaders() {
  return {
    'Cache-Control': 'no-store',
    'X-Robots-Tag':
      'noindex, nofollow, noarchive',
  };
}

function requestHasSameOrigin(
  request: NextRequest,
) {
  const origin =
    request.headers.get('origin');

  if (!origin) return false;

  try {
    return (
      new URL(origin).origin ===
      request.nextUrl.origin
    );
  } catch {
    return false;
  }
}

function configuredProjectRef() {
  const raw =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!raw) return null;

  try {
    const url = new URL(raw);

    if (
      url.protocol !== 'https:' ||
      !url.hostname.endsWith(
        '.supabase.co',
      )
    ) {
      return null;
    }

    return (
      url.hostname.split('.')[0] ??
      null
    );
  } catch {
    return null;
  }
}

function dedicatedQaPreviewAllowed() {
  return (
    process.env.VERCEL_ENV ===
      'preview' &&
    process.env.VEINVITE_QA_STUDIO ===
      'true' &&
    configuredProjectRef() ===
      PREVIEW_SUPABASE_PROJECT_REF
  );
}

function createQaRollbackClient() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    process.env
      .NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return null;
  }

  return createClient(
    url,
    anonKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}

export async function POST(
  request: NextRequest,
) {
  if (!dedicatedQaPreviewAllowed()) {
    return new NextResponse(
      'Not Found',
      {
        status: 404,
        headers: noStoreHeaders(),
      },
    );
  }

  if (!requestHasSameOrigin(request)) {
    return NextResponse.json(
      {
        error:
          'Same-origin Preview QA request required.',
      },
      {
        status: 403,
        headers: noStoreHeaders(),
      },
    );
  }

  const qaClient =
    createQaRollbackClient();

  if (!qaClient) {
    return NextResponse.json(
      {
        error:
          'Preview QA Supabase client is not configured.',
      },
      {
        status: 503,
        headers: noStoreHeaders(),
      },
    );
  }

  const { data, error } =
    await qaClient.rpc(
      'run_sybil_e2e_qa',
    );

  if (error) {
    return NextResponse.json(
      {
        error:
          'Sybil E2E QA could not run.',
        detail: error.message,
      },
      {
        status: 500,
        headers: noStoreHeaders(),
      },
    );
  }

  if (
    !data ||
    typeof data !== 'object' ||
    Array.isArray(data)
  ) {
    return NextResponse.json(
      {
        error:
          'Sybil E2E QA returned malformed data.',
      },
      {
        status: 500,
        headers: noStoreHeaders(),
      },
    );
  }

  const report =
    data as Record<string, unknown>;

  if (report.busy === true) {
    return NextResponse.json(
      report,
      {
        status: 409,
        headers: noStoreHeaders(),
      },
    );
  }

  return NextResponse.json(
    report,
    {
      status:
        report.passed === true
          ? 200
          : 500,
      headers: noStoreHeaders(),
    },
  );
}
