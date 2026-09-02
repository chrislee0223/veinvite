'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

import {
  isLocale,
  localeFromLanguageTag,
  type SupportedLocale,
} from '@/lib/i18n/locales';

const VISITOR_STORAGE_KEY = 'veinvite.analytics.visitor.v1';
const SESSION_STORAGE_KEY = 'veinvite.analytics.session.v2';
const HEARTBEAT_MS = 30_000;
const SESSION_IDLE_MS = 30 * 60_000;
const MAX_ACTIVE_DELTA_SECONDS = 90;

export const USAGE_ANALYTICS_VIEW_EVENT = 'veinvite-analytics-view';

type UsageEventKind = 'start' | 'pageview' | 'heartbeat' | 'end';
type UsageView =
  | 'home'
  | 'guide'
  | 'leaderboard'
  | 'settings'
  | 'invite_landing'
  | 'privacy'
  | 'terms'
  | 'other';
type DeviceBucket = 'mobile' | 'tablet' | 'desktop';
type AcquisitionSource = 'direct' | 'x' | 'telegram' | 'search' | 'vechain' | 'other';

type SessionState = {
  id: string;
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
};

function createUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function readOrCreateVisitorId(): string {
  try {
    const existing = window.localStorage.getItem(VISITOR_STORAGE_KEY);
    if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing;
    const created = createUuid();
    window.localStorage.setItem(VISITOR_STORAGE_KEY, created);
    return created;
  } catch {
    return createUuid();
  }
}

function acquisitionSourceFromReferrer(): AcquisitionSource {
  if (!document.referrer) return 'direct';

  try {
    const referrer = new URL(document.referrer);
    if (referrer.origin === window.location.origin) return 'direct';
    const host = referrer.hostname.toLowerCase();

    if (host === 'x.com' || host.endsWith('.x.com') || host === 'twitter.com' || host.endsWith('.twitter.com')) {
      return 'x';
    }
    if (host === 't.me' || host.endsWith('.t.me') || host.includes('telegram')) {
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
    if (host.includes('vechain') || host.includes('vebetter') || host.includes('veworld')) {
      return 'vechain';
    }
    return 'other';
  } catch {
    return 'other';
  }
}

function readOrCreateSession(source: AcquisitionSource): SessionState {
  const now = Date.now();
  try {
    const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SessionState>;
      if (
        typeof parsed.id === 'string' &&
        typeof parsed.startedAt === 'number' &&
        typeof parsed.lastActivityAt === 'number' &&
        typeof parsed.source === 'string' &&
        now - parsed.lastActivityAt < SESSION_IDLE_MS
      ) {
        return {
          id: parsed.id,
          startedAt: parsed.startedAt,
          lastActivityAt: parsed.lastActivityAt,
          source: parsed.source as AcquisitionSource,
        };
      }
    }
  } catch {
    // Analytics must never affect product usage.
  }

  return { id: createUuid(), startedAt: now, lastActivityAt: now, source };
}

function persistSession(session: SessionState) {
  try {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Analytics must never affect product usage.
  }
}

function currentLocale(): SupportedLocale {
  const fromDocument = localeFromLanguageTag(document.documentElement.lang);
  if (fromDocument) return fromDocument;

  for (const language of navigator.languages ?? []) {
    const fromBrowser = localeFromLanguageTag(language);
    if (fromBrowser) return fromBrowser;
  }

  return 'en';
}

function deviceBucket(): DeviceBucket {
  const width = Math.max(window.innerWidth || 0, document.documentElement.clientWidth || 0);
  if (width < 768) return 'mobile';
  if (width < 1100) return 'tablet';
  return 'desktop';
}

function viewFromPath(pathname: string): UsageView {
  if (pathname === '/') return 'home';
  if (pathname === '/privacy') return 'privacy';
  if (pathname === '/terms') return 'terms';
  if (pathname === '/i' || pathname.startsWith('/i/')) return 'invite_landing';
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

function sendUsagePayload(payload: UsagePayload, useBeacon = false) {
  const body = JSON.stringify(payload);

  if (useBeacon && typeof navigator.sendBeacon === 'function') {
    try {
      const queued = navigator.sendBeacon(
        '/api/analytics/session',
        new Blob([body], { type: 'application/json' }),
      );
      if (queued) return;
    } catch {
      // Fall through to a keepalive fetch.
    }
  }

  void fetch('/api/analytics/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    body,
    keepalive: useBeacon,
  }).catch(() => undefined);
}

export function UsageAnalyticsTracker() {
  const pathname = usePathname();
  const visitorIdRef = useRef<string | null>(null);
  const sessionRef = useRef<SessionState | null>(null);
  const currentViewRef = useRef<UsageView>('home');
  const localeRef = useRef<SupportedLocale>('en');
  const activeSinceRef = useRef<number | null>(null);
  const mountedRef = useRef(false);
  const excludedRef = useRef(false);

  useEffect(() => {
    const initialPath = window.location.pathname || '/';
    excludedRef.current = shouldExcludePath(initialPath);
    if (excludedRef.current) return;

    let cancelled = false;
    let heartbeatTimer: number | null = null;

    const source = acquisitionSourceFromReferrer();
    visitorIdRef.current = readOrCreateVisitorId();
    sessionRef.current = readOrCreateSession(source);
    currentViewRef.current = viewFromPath(initialPath);

    const isEngaged = () => document.visibilityState === 'visible' && document.hasFocus();

    const ensureSession = (): { session: SessionState; created: boolean } | null => {
      const existing = sessionRef.current;
      if (!existing) return null;
      const now = Date.now();
      if (now - existing.lastActivityAt < SESSION_IDLE_MS) {
        return { session: existing, created: false };
      }

      const created: SessionState = {
        id: createUuid(),
        startedAt: now,
        lastActivityAt: now,
        source: existing.source,
      };
      sessionRef.current = created;
      persistSession(created);
      activeSinceRef.current = isEngaged() ? now : null;
      return { session: created, created: true };
    };

    const rawSend = (
      kind: UsageEventKind,
      session: SessionState,
      view: UsageView,
      activeDeltaSeconds: number,
      useBeacon = false,
    ) => {
      const visitorId = visitorIdRef.current;
      if (!visitorId) return;
      const now = Date.now();
      session.lastActivityAt = now;
      persistSession(session);
      sendUsagePayload(
        {
          kind,
          visitorId,
          sessionId: session.id,
          view,
          locale: localeRef.current,
          device: deviceBucket(),
          source: session.source,
          activeDeltaSeconds: Math.max(
            0,
            Math.min(MAX_ACTIVE_DELTA_SECONDS, Math.floor(activeDeltaSeconds)),
          ),
        },
        useBeacon,
      );
    };

    const send = (
      kind: UsageEventKind,
      view: UsageView = currentViewRef.current,
      activeDeltaSeconds = 0,
      useBeacon = false,
    ) => {
      const resolved = ensureSession();
      if (!resolved) return;
      if (resolved.created && kind !== 'start') {
        rawSend('start', resolved.session, view, 0, useBeacon);
      }
      rawSend(kind, resolved.session, view, activeDeltaSeconds, useBeacon);
    };

    const flushEngaged = (kind: 'heartbeat' | 'end', useBeacon = false) => {
      const started = activeSinceRef.current;
      const now = Date.now();
      const delta = started === null ? 0 : Math.max(0, (now - started) / 1000);
      activeSinceRef.current = isEngaged() ? now : null;
      if (delta > 0 || kind === 'end') {
        send(kind, currentViewRef.current, delta, useBeacon);
      }
    };

    const start = () => {
      if (cancelled) return;
      localeRef.current = currentLocale();
      const session = sessionRef.current;
      if (!session) return;
      persistSession(session);
      rawSend('start', session, currentViewRef.current, 0);
      activeSinceRef.current = isEngaged() ? Date.now() : null;
      mountedRef.current = true;

      heartbeatTimer = window.setInterval(() => {
        if (!isEngaged()) return;
        flushEngaged('heartbeat');
      }, HEARTBEAT_MS);
    };

    const startTimer = window.setTimeout(start, 0);

    const onVisibilityChange = () => {
      if (!mountedRef.current) return;
      if (document.visibilityState === 'hidden') {
        flushEngaged('heartbeat', true);
      } else if (document.hasFocus()) {
        const resolved = ensureSession();
        if (resolved?.created) rawSend('start', resolved.session, currentViewRef.current, 0);
        activeSinceRef.current = Date.now();
      }
    };

    const onFocus = () => {
      if (!mountedRef.current || document.visibilityState !== 'visible') return;
      const resolved = ensureSession();
      if (resolved?.created) rawSend('start', resolved.session, currentViewRef.current, 0);
      activeSinceRef.current = Date.now();
    };

    const onBlur = () => {
      if (!mountedRef.current) return;
      flushEngaged('heartbeat', true);
      activeSinceRef.current = null;
    };

    const onPageHide = () => {
      if (!mountedRef.current) return;
      flushEngaged('end', true);
    };

    const onAnalyticsView = (event: Event) => {
      if (!mountedRef.current) return;
      const detail = (event as CustomEvent<unknown>).detail;
      if (detail !== 'home' && detail !== 'guide' && detail !== 'leaderboard' && detail !== 'settings') {
        return;
      }
      const nextView = detail as UsageView;
      if (nextView === currentViewRef.current) return;
      flushEngaged('heartbeat');
      currentViewRef.current = nextView;
      send('pageview', nextView);
    };

    const onLanguageChange = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (!isLocale(detail)) return;
      localeRef.current = detail;
      if (mountedRef.current) send('heartbeat');
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener(USAGE_ANALYTICS_VIEW_EVENT, onAnalyticsView);
    window.addEventListener('veinvite-language-change', onLanguageChange);

    return () => {
      cancelled = true;
      window.clearTimeout(startTimer);
      if (heartbeatTimer !== null) window.clearInterval(heartbeatTimer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener(USAGE_ANALYTICS_VIEW_EVENT, onAnalyticsView);
      window.removeEventListener('veinvite-language-change', onLanguageChange);
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!mountedRef.current || excludedRef.current || !pathname) return;
    if (shouldExcludePath(pathname)) return;
    const nextView = viewFromPath(pathname);
    if (nextView === currentViewRef.current) return;
    currentViewRef.current = nextView;

    const visitorId = visitorIdRef.current;
    const session = sessionRef.current;
    if (!visitorId || !session) return;
    session.lastActivityAt = Date.now();
    persistSession(session);
    sendUsagePayload({
      kind: 'pageview',
      visitorId,
      sessionId: session.id,
      view: nextView,
      locale: localeRef.current,
      device: deviceBucket(),
      source: session.source,
      activeDeltaSeconds: 0,
    });
  }, [pathname]);

  return null;
}
