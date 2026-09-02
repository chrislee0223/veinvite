import { createHash } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

import { isLocale } from '@/lib/i18n/locales';
import {
  enforceRateLimits,
  getClientIpSubject,
} from '@/lib/rateLimitServer';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { getWalletSession } from '@/lib/walletAuthServer';

export const dynamic = 'force-dynamic';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const USAGE_VIEWS = new Set([
  'home',
  'guide',
  'leaderboard',
  'settings',
  'invite_landing',
  'privacy',
  'terms',
  'other',
]);
const EVENT_KINDS = new Set(['start', 'pageview', 'heartbeat', 'end']);
const DEVICE_BUCKETS = new Set(['mobile', 'tablet', 'desktop']);
const ACQUISITION_SOURCES = new Set(['direct', 'x', 'telegram', 'search', 'vechain', 'other']);
const BOT_USER_AGENT_PATTERN = /(?:bot|crawler|spider|slurp|headless|facebookexternalhit|twitterbot|discordbot|slackbot|telegrambot|whatsapp)/i;

function noStore(status = 204) {
  return new NextResponse(null, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function requestHasSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;

  try {
    return new URL(origin).origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}

function shouldIgnoreRequest(request: NextRequest): boolean {
  if (process.env.VERCEL_ENV !== 'production') return true;
  const userAgent = request.headers.get('user-agent') ?? '';
  return BOT_USER_AGENT_PATTERN.test(userAgent);
}

function visitorKey(visitorId: string): string {
  return createHash('sha256')
    .update(`veinvite-usage-visitor-v1\n${visitorId.toLowerCase()}`, 'utf8')
    .digest('hex');
}

function readBodyRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export async function POST(request: NextRequest) {
  if (shouldIgnoreRequest(request)) return noStore();

  if (!requestHasSameOrigin(request)) {
    return noStore(403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return noStore(400);
  }

  const record = readBodyRecord(body);
  if (!record) return noStore(400);

  const kind = typeof record.kind === 'string' ? record.kind : '';
  const rawVisitorId = typeof record.visitorId === 'string' ? record.visitorId.trim() : '';
  const sessionId = typeof record.sessionId === 'string' ? record.sessionId.trim() : '';
  const view = typeof record.view === 'string' ? record.view : '';
  const locale = record.locale;
  const device = typeof record.device === 'string' ? record.device : '';
  const source = typeof record.source === 'string' ? record.source : '';
  const activeDeltaSeconds = Number(record.activeDeltaSeconds);

  if (
    !EVENT_KINDS.has(kind) ||
    !UUID_PATTERN.test(rawVisitorId) ||
    !UUID_PATTERN.test(sessionId) ||
    !USAGE_VIEWS.has(view) ||
    !isLocale(locale) ||
    !DEVICE_BUCKETS.has(device) ||
    !ACQUISITION_SOURCES.has(source) ||
    !Number.isSafeInteger(activeDeltaSeconds) ||
    activeDeltaSeconds < 0 ||
    activeDeltaSeconds > 90
  ) {
    return noStore(400);
  }

  const hashedVisitor = visitorKey(rawVisitorId);
  const ipSubject = getClientIpSubject(request);
  const limited = await enforceRateLimits([
    {
      scope: 'usage-analytics-visitor',
      subject: hashedVisitor,
      limit: 300,
      windowSeconds: 60 * 60,
    },
    ipSubject
      ? {
          scope: 'usage-analytics-ip',
          subject: ipSubject,
          limit: 1200,
          windowSeconds: 60 * 60,
        }
      : null,
  ]);

  if (limited) return limited;

  let walletConnected = false;
  if (kind !== 'heartbeat') {
    try {
      walletConnected = Boolean(await getWalletSession(request));
    } catch (error) {
      console.warn('Usage analytics wallet-session check failed:', error);
    }
  }

  const { error } = await supabaseAdmin.rpc('record_app_usage_event', {
    p_session_id: sessionId.toLowerCase(),
    p_visitor_key: hashedVisitor,
    p_kind: kind,
    p_view_name: view,
    p_locale: locale,
    p_device_bucket: device,
    p_acquisition_source: source,
    p_active_delta_seconds: activeDeltaSeconds,
    p_wallet_connected: walletConnected,
  });

  if (error) {
    console.error('Usage analytics event could not be stored:', error);
    return noStore(503);
  }

  return noStore();
}
