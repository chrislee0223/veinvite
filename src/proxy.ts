import {
  type NextRequest,
  NextResponse,
} from 'next/server';

function uiTestAllowed(): boolean {
  return (
    process.env.NODE_ENV === 'development' ||
    process.env.VERCEL_ENV === 'preview'
  );
}

export function proxy(request: NextRequest) {
  if (
    request.nextUrl.pathname === '/ui-test' &&
    !uiTestAllowed()
  ) {
    return new NextResponse('Not Found', {
      status: 404,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Robots-Tag': 'noindex, nofollow, noarchive',
      },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/ui-test'],
};
