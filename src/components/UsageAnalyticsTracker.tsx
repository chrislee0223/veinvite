'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

const VISITOR_STORAGE_KEY = 'veinvite.analytics.visitor.v1';
const SESSION_STORAGE_KEY = 'veinvite.analytics.session.v1';
const HEARTBEAT_MS = 60_000;
const SESSION_IDLE_MS = 30 * 60_000;

type SessionState = {
  id: string;
  startedAt: number;
  lastActivityAt: number;
};

function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function readOrCreateVisitorId(): string {
  try {
    const existing = window.localStorage.getItem(VISITOR_STORAGE_KEY);
    if (existing) return existing;
    const created = randomId();
    window.localStorage.setItem(VISITOR_STORAGE_KEY, created);
    return created;
  } catch {
    return randomId();
  }
}

function readOrCreateSession(): SessionState {
  const now = Date.now();
  try {
    const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SessionState>;
      if (
        typeof parsed.id === 'string' &&
        typeof parsed.startedAt === 'number' &&
        typeof parsed.lastActivityAt === 'number' &&
        now - parsed.lastActivityAt < SESSION_IDLE_MS
      ) {
        return {
          id: parsed.id,
          startedAt: parsed.startedAt,
          lastActivityAt: now,
        };
      }
    }
  } catch {
    // Fall through to a new session.
  }

  return { id: randomId(), startedAt: now, lastActivityAt: now };
}

function persistSession(session: SessionState) {
  try {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Analytics must never affect product usage.
  }
}

function postUsageEvent(payload: Record<string, unknown>, useBeacon = false) {
  const body = JSON.stringify(payload);
  if (useBeacon && typeof navigator !== 'undefined' && navigator.sendBeacon) {
    try {
      navigator.sendBeacon(
        '/api/analytics/session',
        new Blob([body], { type: 'application/json' }),
      );
      return;
    } catch {
      // Fall back to fetch.
    }
  }

  void fetch('/api/analytics/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    keepalive: useBeacon,
  }).catch(() => undefined);
}

export function UsageAnalyticsTracker() {
  const pathname = usePathname();
  const visitorIdRef = useRef<string | null>(null);
  const sessionRef = useRef<SessionState | null>(null);
  const lastHeartbeatAtRef = useRef<number>(0);
  const previousPathRef = useRef<string | null>(null);

  useEffect(() => {
    visitorIdRef.current = readOrCreateVisitorId();
    sessionRef.current = readOrCreateSession();
    persistSession(sessionRef.current);

    const send = (kind: 'start' | 'heartbeat' | 'pageview' | 'end', path: string, useBeacon = false) => {
      const visitorId = visitorIdRef.current;
      const session = sessionRef.current;
      if (!visitorId || !session) return;
      const now = Date.now();
      session.lastActivityAt = now;
      persistSession(session);
      postUsageEvent(
        {
          kind,
          visitorId,
          sessionId: session.id,
          path,
        },
        useBeacon,
      );
    };

    send('start', window.location.pathname || '/');
    lastHeartbeatAtRef.current = Date.now();

    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastHeartbeatAtRef.current < HEARTBEAT_MS - 5_000) return;
      lastHeartbeatAtRef.current = now;
      send('heartbeat', window.location.pathname || '/');
    }, 15_000);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        lastHeartbeatAtRef.current = Date.now();
        send('heartbeat', window.location.pathname || '/');
      }
    };

    const onPageHide = () => send('end', window.location.pathname || '/', true);

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onPageHide);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, []);

  useEffect(() => {
    if (!pathname) return;
    if (!visitorIdRef.current || !sessionRef.current) return;
    if (previousPathRef.current === null) {
      previousPathRef.current = pathname;
      return;
    }
    if (previousPathRef.current === pathname) return;
    previousPathRef.current = pathname;
    postUsageEvent({
      kind: 'pageview',
      visitorId: visitorIdRef.current,
      sessionId: sessionRef.current.id,
      path: pathname,
    });
  }, [pathname]);

  return null;
}
