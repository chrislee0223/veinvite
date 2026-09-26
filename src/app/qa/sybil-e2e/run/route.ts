import {
  NextRequest,
  NextResponse,
} from 'next/server';

import { supabaseAdmin } from '@/lib/supabaseServer';

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

function previewQaAllowed() {
  return (
    process.env.VERCEL_ENV ===
      'preview' &&
    process.env.VEINVITE_QA_STUDIO !==
      'true' &&
    configuredProjectRef() ===
      PREVIEW_SUPABASE_PROJECT_REF
  );
}

export async function POST(
  request: NextRequest,
) {
  if (!previewQaAllowed()) {
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

  const { data, error } =
    await supabaseAdmin.rpc(
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
  const passed =
    report.passed === true;

  return NextResponse.json(
    report,
    {
      status: passed ? 200 : 500,
      headers: noStoreHeaders(),
    },
  );
}
