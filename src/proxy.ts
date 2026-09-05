import {
  type NextRequest,
  NextResponse,
} from 'next/server';

import {
  isDedicatedQaHost,
  isQaStudioAccessAllowed,
} from '@/qa/access';

const SAFE_METHODS = new Set([
  'GET',
  'HEAD',
  'OPTIONS',
]);

function uiTestAllowed(): boolean {
  return (
    process.env.NODE_ENV === 'development' ||
    process.env.VERCEL_ENV === 'preview'
  );
}

function notFoundResponse() {
  return new NextResponse('Not Found', {
    status: 404,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
    },
  });
}

function requestHost(request: NextRequest): string | null {
  return (
    request.headers.get('x-forwarded-host') ??
    request.headers.get('host') ??
    request.nextUrl.host ??
    null
  );
}

function isCrossSiteApiMutation(
  request: NextRequest,
): boolean {
  if (
    !request.nextUrl.pathname.startsWith('/api/') ||
    SAFE_METHODS.has(request.method.toUpperCase())
  ) {
    return false;
  }

  const origin = request.headers.get('origin');

  if (origin) {
    try {
      if (new URL(origin).origin !== request.nextUrl.origin) {
        return true;
      }
    } catch {
      return true;
    }
  }

  const fetchSite = request.headers
    .get('sec-fetch-site')
    ?.toLowerCase();

  // Browser-originated cross-site and sibling-site writes are rejected even
  // when an intermediary strips Origin. Requests with neither browser header
  // remain compatible with trusted server-to-server tooling and signed cron
  // operations, whose own authentication continues to apply in the route.
  return (
    fetchSite === 'cross-site' ||
    fetchSite === 'same-site'
  );
}

export function proxy(request: NextRequest) {
  const host = requestHost(request);
  const pathname = request.nextUrl.pathname;

  if (
    (pathname === '/qa' || pathname.startsWith('/qa/')) &&
    !isQaStudioAccessAllowed(host)
  ) {
    return notFoundResponse();
  }

  // A fixed QA project may share this repository and therefore also inherit
  // application API routes and cron configuration. On the dedicated QA host,
  // fail closed on every /api request so simulator usage can never mutate app
  // state merely because the QA project was deployed from the same codebase.
  if (
    pathname.startsWith('/api/') &&
    isDedicatedQaHost(host)
  ) {
    return notFoundResponse();
  }

  if (
    pathname.startsWith('/ui-test') &&
    !uiTestAllowed()
  ) {
    return notFoundResponse();
  }

  if (isCrossSiteApiMutation(request)) {
    return NextResponse.json(
      {
        error:
          'Cross-site mutation requests are not allowed.',
      },
      {
        status: 403,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/qa',
    '/qa/:path*',
    '/ui-test',
    '/ui-test/:path*',
    '/api/:path*',
  ],
};
