'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

import {
  isLocale,
  localeFromLanguageTag,
  type SupportedLocale,
} from '@/lib/i18n/locales';
import {
  readUsageAnalyticsEnabled,
  USAGE_ANALYTICS_DAILY_VISITOR_STORAGE_KEY,
  USAGE_ANALYTICS_PREFERENCE_EVENT,
  USAGE_ANALYTICS_SEEN_STORAGE_KEY,
  USAGE_ANALYTICS_SESSION_STORAGE_KEY,
  USAGE_ANALYTICS_WALLET_AUTH_EVENT,
} from '@/lib/usageAnalyticsPreference';

const HEARTBEAT_MS = 30_000;
const SESSION_IDLE_MS = 30 * 60_000;
const MAX_ACTIVE_DELTA_SECONDS = 90;

export const USAGE_ANALYTICS_VIEW_EVENT =
  'veinvite-analytics-view';

type UsageEventKind =
  | 'start'
  | 'pageview'
  | 'heartbeat'
  | 'end'
  | 'wallet_authenticated';
type UsageView =
  | 'home'
  | 'guide'
  | 'leaderboard'
  | 'settings'
  | 'invite_landing'
  | 'privacy'
  | 'terms'
  | 'other';
type DeviceBucket =
  | 'mobile'
  | 'tablet'
  | 'desktop';
type AcquisitionSource =
  | 'direct'
  | 'x'
  | 'telegram'
  | 'search'
  | 'vechain'
  | 'other';

type DailyVisitorIdentity = {
  id: string;
  dayKey: string;
  returning: boolean;
};

type SessionState = {
  id: string;
  dayKey: string;
  startedAt: number;
  lastActivityAt: number;
  source: AcquisitionSource;
};

type UsagePayload = {
  kind: UsageEventKind;
  visitorId: string;
  sessionId: string;
  view: UsageView;
  locale: SupportedLocale;
  device: DeviceBucket;
  source: AcquisitionSource;
  activeDeltaSeconds: number;
  returningVisitor: boolean;
};

function createUuid(): string {
  const cryptoApi = globalThis.crypto;

  if (
    cryptoApi &&
    typeof cryptoApi.randomUUID === 'function'
  ) {
    return cryptoApi.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (
    cryptoApi &&
    typeof cryptoApi.getRandomValues === 'function'
  ) {
    cryptoApi.getRandomValues(bytes);
  } else {
    // This identifier is analytics-only and never used for auth or rewards.
    // Keep tracking non-fatal in restricted/legacy WebViews without Web Crypto.
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(
    bytes,
    (value) => value.toString(16).padStart(2, '0'),
  ).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function seoulDayKey(): string {
  const parts = new Intl.DateTimeFormat(
    'en-CA',
    {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    },
  ).formatToParts(new Date());
  const read = (type: 'year' | 'month' | 'day') =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${read('year')}-${read('month')}-${read('day')}`;
}

function readOrCreateDailyVisitor(): DailyVisitorIdentity {
  const dayKey = seoulDayKey();

  try {
    const raw = window.localStorage.getItem(
      USAGE_ANALYTICS_DAILY_VISITOR_STORAGE_KEY,
    );

    if (raw) {
      const parsed = JSON.parse(raw) as Partial<DailyVisitorIdentity>;
      if (
        parsed.dayKey === dayKey &&
        typeof parsed.id === 'string' &&
        /^[0-9a-f-]{36}$/i.test(parsed.id) &&
        typeof parsed.returning === 'boolean'
      ) {
        return {
          id: parsed.id,
          dayKey,
          returning: parsed.returning,
        };
      }
    }

    const returning =
      window.localStorage.getItem(
        USAGE_ANALYTICS_SEEN_STORAGE_KEY,
      ) === '1';
    const created: DailyVisitorIdentity = {
      id: createUuid(),
      dayKey,
      returning,
    };

    window.localStorage.setItem(
      USAGE_ANALYTICS_DAILY_VISITOR_STORAGE_KEY,
      JSON.stringify(created),
    );
    window.localStorage.setItem(
      USAGE_ANALYTICS_SEEN_STORAGE_KEY,
      '1',
    );

    return created;
  } catch {
    return {
      id: createUuid(),
      dayKey,
      returning: false,
    };
  }
}

function acquisitionSourceFromReferrer(): AcquisitionSource {
  if (!document.referrer) return 'direct';

  try {
    const referrer = new URL(document.referrer);
    if (referrer.origin === window.location.origin) return 'direct';

    const host = referrer.hostname.toLowerCase();
    if (
      host === 'x.com' ||
      host.endsWith('.x.com') ||
      host === 'twitter.com' ||
      host.endsWith('.twitter.com')
    ) {
      return 'x';
    }
    if (
      host === 't.me' ||
      host.endsWith('.t.me') ||
      host.includes('telegram')
    ) {
      return 'telegram';
    }
    if (
      host.includes('google.') ||
      host.includes('bing.') ||
      host.includes('duckduckgo.') ||
      host.includes('yahoo.') ||
      host.includes('naver.')
    ) {
      return 'search';
    }
    if (
      host.includes('vechain') ||
      host.includes('vebetter') ||
      host.includes('veworld')
    ) {
      return 'vechain';
    }
    return 'other';
  } catch {
    return 'other';
  }
}

function createSession(
  source: AcquisitionSource,
  dayKey: string,
): SessionState {
  const now = Date.now();
  return {
    id: createUuid(),
    dayKey,
    startedAt: now,
    lastActivityAt: now,
    source,
  };
}

function readOrCreateSession(
  source: AcquisitionSource,
  dayKey: string,
): SessionState {
  const now = Date.now();

  try {
    const raw = window.sessionStorage.getItem(
      USAGE_ANALYTICS_SESSION_STORAGE_KEY,
    );
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SessionState>;
      if (
        typeof parsed.id === 'string' &&
        parsed.dayKey === dayKey &&
        typeof parsed.startedAt === 'number' &&
        typeof parsed.lastActivityAt === 'number' &&
        typeof parsed.source === 'string' &&
        now - parsed.lastActivityAt < SESSION_IDLE_MS
      ) {
        return {
          id: parsed.id,
          dayKey,
          startedAt: parsed.startedAt,
          lastActivityAt: parsed.lastActivityAt,
          source: parsed.source as AcquisitionSource,
        };
      }
    }
  } catch {
    // Analytics must never affect product usage.
  }

  return createSession(source, dayKey);
}

function persistSession(session: SessionState) {
  try {
    window.sessionStorage.setItem(
      USAGE_ANALYTICS_SESSION_STORAGE_KEY,
      JSON.stringify(session),
    );
  } catch {
    // Analytics must never affect product usage.
  }
}

function currentLocale(): SupportedLocale {
  const fromDocument = localeFromLanguageTag(
    document.documentElement.lang,
  );
  if (fromDocument) return fromDocument;

  for (const language of navigator.languages ?? []) {
    const fromBrowser = localeFromLanguageTag(language);
    if (fromBrowser) return fromBrowser;
  }

  return 'en';
}

function deviceBucket(): DeviceBucket {
  const width = Math.max(
    window.innerWidth || 0,
    document.documentElement.clientWidth || 0,
  );
  if (width < 768) return 'mobile';
  if (width < 1100) return 'tablet';
  return 'desktop';
}

function viewFromPath(pathname: string): UsageView {
  if (pathname === '/') return 'home';
  if (pathname === '/privacy') return 'privacy';
  if (pathname === '/terms') return 'terms';
  if (
    pathname === '/i' ||
    pathname.startsWith('/i/') ||
    pathname === '/r' ||
    pathname.startsWith('/r/')
  ) {
    // Both legacy one-time links and permanent referral links intentionally
    // collapse into the same privacy-safe analytics bucket. Never send the raw
    // /r/<key> path or the referral key to analytics storage.
    return 'invite_landing';
  }
  return 'other';
}

function shouldExcludePath(pathname: string): boolean {
  return (
    pathname === '/admin' ||
    pathname.startsWith('/admin/') ||
    pathname === '/ui-test' ||
    pathname.startsWith('/ui-test/') ||
    pathname.startsWith('/api/')
  );
}

function sendUsagePayload(
  payload: UsagePayload,
  useBeacon = false,
) {
  const body = JSON.stringify(payload);

  if (
    useBeacon &&
    typeof navigator.sendBeacon === 'function'
  ) {
    try {
      const queued = navigator.sendBeacon(
        '/api/analytics/session',
        new Blob([body], {
          type: 'application/json',
        }),
      );
      if (queued) return;
    } catch {
      // Fall through to a keepalive fetch.
    }
  }

  void fetch('/api/analytics/session', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    credentials: 'same-origin',
    body,
    keepalive: useBeacon,
  }).catch(() => undefined);
}

export function UsageAnalyticsTracker() {
  const pathname = usePathname();
  const [preferenceReady, setPreferenceReady] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const visitorRef = useRef<DailyVisitorIdentity | null>(null);
  const sessionRef = useRef<SessionState | null>(null);
  const currentViewRef = useRef<UsageView>('home');
  const localeRef = useRef<SupportedLocale>('en');
  const activeSinceRef = useRef<number | null>(null);
  const mountedRef = useRef(false);
  const excludedRef = useRef(false);

  useEffect(() => {
    setEnabled(readUsageAnalyticsEnabled());
    setPreferenceReady(true);

    const onPreferenceChange = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (typeof detail === 'boolean') {
        setEnabled(detail);
      } else {
        setEnabled(readUsageAnalyticsEnabled());
      }
    };

    window.addEventListener(
      USAGE_ANALYTICS_PREFERENCE_EVENT,
      onPreferenceChange,
    );
    return () => window.removeEventListener(
      USAGE_ANALYTICS_PREFERENCE_EVENT,
      onPreferenceChange,
    );
  }, []);

  useEffect(() => {
    excludedRef.current = shouldExcludePath(pathname);
  }, [pathname]);

  useEffect(() => {
    if (!preferenceReady || !enabled || excludedRef.current) return;

    const source = acquisitionSourceFromReferrer();
    const visitor = readOrCreateDailyVisitor();
    const session = readOrCreateSession(source, visitor.dayKey);
    const view = viewFromPath(pathname);
    const locale = currentLocale();

    visitorRef.current = visitor;
    sessionRef.current = session;
    currentViewRef.current = view;
    localeRef.current = locale;
    activeSinceRef.current = document.visibilityState === 'visible'
      ? Date.now()
      : null;
    mountedRef.current = true;
    persistSession(session);

    sendUsagePayload({
      kind: 'start',
      visitorId: visitor.id,
      sessionId: session.id,
      view,
      locale,
      device: deviceBucket(),
      source: session.source,
      activeDeltaSeconds: 0,
      returningVisitor: visitor.returning,
    });

    return () => {
      mountedRef.current = false;
    };
  }, [enabled, pathname, preferenceReady]);

  useEffect(() => {
    if (!preferenceReady || !enabled || !mountedRef.current || excludedRef.current) {
      return;
    }
    const visitor = visitorRef.current;
    const session = sessionRef.current;
    if (!visitor || !session) return;

    const nextView = viewFromPath(pathname);
    if (nextView === currentViewRef.current) return;
    currentViewRef.current = nextView;
    localeRef.current = currentLocale();

    sendUsagePayload({
      kind: 'pageview',
      visitorId: visitor.id,
      sessionId: session.id,
      view: nextView,
      locale: localeRef.current,
      device: deviceBucket(),
      source: session.source,
      activeDeltaSeconds: 0,
      returningVisitor: visitor.returning,
    });
  }, [enabled, pathname, preferenceReady]);

  useEffect(() => {
    if (!preferenceReady || !enabled || excludedRef.current) return;

    const onLanguageChange = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (isLocale(detail)) localeRef.current = detail;
    };

    window.addEventListener(
      'veinvite-language-change',
      onLanguageChange,
    );
    return () => window.removeEventListener(
      'veinvite-language-change',
      onLanguageChange,
    );
  }, [enabled, preferenceReady]);

  useEffect(() => {
    if (!preferenceReady || !enabled || excludedRef.current) return;

    const flushActiveTime = (
      kind: 'heartbeat' | 'end',
      useBeacon = false,
    ) => {
      const visitor = visitorRef.current;
      const session = sessionRef.current;
      if (!visitor || !session) return;

      const now = Date.now();
      const activeSince = activeSinceRef.current;
      const deltaSeconds = activeSince === null
        ? 0
        : Math.max(
            0,
            Math.min(
              MAX_ACTIVE_DELTA_SECONDS,
              Math.floor((now - activeSince) / 1000),
            ),
          );
      session.lastActivityAt = now;
      persistSession(session);
      if (document.visibilityState === 'visible') {
        activeSinceRef.current = now;
      }

      sendUsagePayload(
        {
          kind,
          visitorId: visitor.id,
          sessionId: session.id,
          view: currentViewRef.current,
          locale: localeRef.current,
          device: deviceBucket(),
          source: session.source,
          activeDeltaSeconds: deltaSeconds,
          returningVisitor: visitor.returning,
        },
        useBeacon,
      );
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushActiveTime('heartbeat', true);
        activeSinceRef.current = null;
      } else {
        activeSinceRef.current = Date.now();
      }
    };
    const onPageHide = () => flushActiveTime('end', true);
    const intervalId = window.setInterval(
      () => {
        if (document.visibilityState === 'visible') {
          flushActiveTime('heartbeat');
        }
      },
      HEARTBEAT_MS,
    );

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [enabled, preferenceReady]);

  useEffect(() => {
    if (!preferenceReady || !enabled || excludedRef.current) return;

    const onWalletAuthenticated = () => {
      const visitor = visitorRef.current;
      const session = sessionRef.current;
      if (!visitor || !session) return;

      sendUsagePayload({
        kind: 'wallet_authenticated',
        visitorId: visitor.id,
        sessionId: session.id,
        view: currentViewRef.current,
        locale: localeRef.current,
        device: deviceBucket(),
        source: session.source,
        activeDeltaSeconds: 0,
        returningVisitor: visitor.returning,
      });
    };

    window.addEventListener(
      USAGE_ANALYTICS_WALLET_AUTH_EVENT,
      onWalletAuthenticated,
    );
    return () => window.removeEventListener(
      USAGE_ANALYTICS_WALLET_AUTH_EVENT,
      onWalletAuthenticated,
    );
  }, [enabled, preferenceReady]);

  useEffect(() => {
    if (!preferenceReady || !enabled || excludedRef.current) return;

    const onVirtualView = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (
        detail !== 'home' &&
        detail !== 'guide' &&
        detail !== 'leaderboard' &&
        detail !== 'settings'
      ) {
        return;
      }
      const visitor = visitorRef.current;
      const session = sessionRef.current;
      if (!visitor || !session || currentViewRef.current === detail) return;
      currentViewRef.current = detail;

      sendUsagePayload({
        kind: 'pageview',
        visitorId: visitor.id,
        sessionId: session.id,
        view: detail,
        locale: localeRef.current,
        device: deviceBucket(),
        source: session.source,
        activeDeltaSeconds: 0,
        returningVisitor: visitor.returning,
      });
    };

    window.addEventListener(
      USAGE_ANALYTICS_VIEW_EVENT,
      onVirtualView,
    );
    return () => window.removeEventListener(
      USAGE_ANALYTICS_VIEW_EVENT,
      onVirtualView,
    );
  }, [enabled, preferenceReady]);

  return null;
}
