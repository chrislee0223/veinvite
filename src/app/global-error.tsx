'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: '#0b0b0b',
          color: '#f5f5f5',
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
        }}
      >
        <main
          style={{
            width: 'min(420px, calc(100vw - 40px))',
            textAlign: 'center',
            padding: '32px 20px',
          }}
        >
          <h1 style={{ margin: '0 0 12px', fontSize: 24 }}>VeInvite</h1>
          <p style={{ margin: '0 0 20px', lineHeight: 1.6, opacity: 0.82 }}>
            Something went wrong. Please try again.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              border: '1px solid rgba(255,255,255,.24)',
              borderRadius: 12,
              padding: '10px 18px',
              background: '#171717',
              color: 'inherit',
              cursor: 'pointer',
              font: 'inherit',
              fontWeight: 700,
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
