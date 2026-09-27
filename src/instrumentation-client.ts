import * as Sentry from '@sentry/nextjs';

import { redactSentryText, redactSentryUrl } from '@/lib/sentryRedaction';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

const KNOWN_EXTERNAL_EXTENSION_ERRORS = new Set([
  'Could not establish connection. Receiving end does not exist.',
  'MetaMask extension not found',
  'Failed to connect to MetaMask',
]);

const KNOWN_EXTERNAL_EXTENSION_FRAMES = new Set([
  'app:///injectedScript.bundle.js',
  'app:///scripts/inpage.js',
]);

function isKnownExternalExtensionNoise(event: {
  message?: string;
  exception?: {
    values?: Array<{
      value?: string;
      stacktrace?: {
        frames?: Array<{
          filename?: string;
        }>;
      };
    }>;
  };
}): boolean {
  const exceptions = event.exception?.values ?? [];
  const messages = [
    event.message,
    ...exceptions.map((exception) => exception.value),
  ];

  const hasKnownMessage = messages.some(
    (message) =>
      typeof message === 'string' &&
      KNOWN_EXTERNAL_EXTENSION_ERRORS.has(message.trim()),
  );
  if (!hasKnownMessage) return false;

  return exceptions.some((exception) =>
    exception.stacktrace?.frames?.some(
      (frame) =>
        typeof frame.filename === 'string' &&
        KNOWN_EXTERNAL_EXTENSION_FRAMES.has(frame.filename),
    ),
  );
}

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment:
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
  sendDefaultPii: false,
  tracesSampleRate: 0.1,
  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1,
  beforeSend(event) {
    if (isKnownExternalExtensionNoise(event)) return null;

    if (event.message) event.message = redactSentryText(event.message);
    if (event.request?.url) event.request.url = redactSentryUrl(event.request.url);

    for (const exception of event.exception?.values ?? []) {
      if (exception.value) exception.value = redactSentryText(exception.value);
    }

    return event;
  },
  beforeBreadcrumb(breadcrumb) {
    if (breadcrumb.message) {
      breadcrumb.message = redactSentryText(breadcrumb.message);
    }

    if (breadcrumb.data) {
      for (const key of ['url', 'from', 'to']) {
        const value = breadcrumb.data[key];
        if (typeof value === 'string') {
          breadcrumb.data[key] = redactSentryUrl(value);
        }
      }
    }

    return breadcrumb;
  },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
