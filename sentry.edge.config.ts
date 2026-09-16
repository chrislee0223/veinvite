import * as Sentry from '@sentry/nextjs';

import { redactSentryText, redactSentryUrl } from './src/lib/sentryRedaction';

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment:
    process.env.SENTRY_ENVIRONMENT ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  sendDefaultPii: false,
  tracesSampleRate: 0.1,
  beforeSend(event) {
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
