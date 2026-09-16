import * as Sentry from '@sentry/nextjs';

import {
  redactSentryText,
  redactSentryUrl,
  redactSentryValue,
} from './src/lib/sentryRedaction';

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment:
    process.env.SENTRY_ENVIRONMENT ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  sendDefaultPii: false,
  tracesSampleRate: 0.1,
  // VeInvite already makes operational failures loud with console.error in the
  // invite, mission reconciliation, Claim and payout paths. Capture those
  // handled server failures as Sentry events too, while beforeSend below strips
  // wallet/referral/transaction identifiers from structured console arguments.
  integrations: [
    Sentry.captureConsoleIntegration({ levels: ['error'] }),
  ],
  beforeSend(event) {
    if (event.message) event.message = redactSentryText(event.message);
    if (event.request?.url) event.request.url = redactSentryUrl(event.request.url);

    for (const exception of event.exception?.values ?? []) {
      if (exception.value) exception.value = redactSentryText(exception.value);
    }

    if (event.extra) {
      event.extra = redactSentryValue(event.extra) as typeof event.extra;
    }

    if (event.request?.data !== undefined) {
      event.request.data = redactSentryValue(event.request.data);
    }

    if (event.request?.headers) {
      event.request.headers = redactSentryValue(
        event.request.headers,
      ) as typeof event.request.headers;
    }

    return event;
  },
  beforeBreadcrumb(breadcrumb) {
    if (breadcrumb.message) {
      breadcrumb.message = redactSentryText(breadcrumb.message);
    }

    if (breadcrumb.data) {
      breadcrumb.data = redactSentryValue(breadcrumb.data) as typeof breadcrumb.data;
    }

    return breadcrumb;
  },
});
