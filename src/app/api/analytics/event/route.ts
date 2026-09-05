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
const EVENT_NAMES = new Set([
  'wallet_connect_started',
  'wallet_auth_succeeded',
  'wallet_auth_failed',
  'invite_link_copied',
  'invite_link_shared',
  'invite_accept_started',
  'invite_accept_succeeded',
  'invite_accept_review',
  'invite_accept_failed',
  'mission_action_opened',
  'reward_claim_started',
  'reward_claim_succeeded',
  'reward_claim_failed',
]);
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
const DEVICE_BUCKETS = new Set([
  'mobile',
  'tablet',
  'desktop',
]);
const ACQUISITION_SOURCES = new Set([
  'direct',
  'x',
  'telegram',
  'search',
  'vechain',
  'other',
]);
const OUTCOMES = new Set([
  'none',
  'success',
  'failure',
  'review',
  'cancelled',
]);
const FAILURE_CODES = new Set([
  'none',
  'invalid_link',
  'slots_full',
  'existing_user',
  'self_referral',
  'already_referred',
  'already_used',
  'eligibility',
  'network',
  'server',
  'malformed_response',
  'wallet_auth',
  'unknown',
]);
const MISSION_KEYS = new Set([
  'none',
  'vebetter_apps',
  'governance_vote',
]);
const FLOW_KEYS = new Set([
  'none',
  'home',
  'permanent_referral',
  'legacy_invite',
]);
const ENTRY_CLASSES = new Set([
  'none',
  'new_user',
  'returning_user',
]);
const BOT_USER_AGENT_PATTERN = /(?:bot|crawler|spider|slurp|headless|facebookexternalhit|twitterbot|discordbot|slackbot|telegrambot|whatsapp)/i;

function noStore(status = 204) {
  return new NextResponse(null, {
    status,
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}

function requestHasSameOrigin(
  request: NextRequest,
): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;

  try {
    return new URL(origin).origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}

function shouldIgnoreRequest(
  request: NextRequest,
): boolean {
  if (process.env.VERCEL_ENV !== 'production') {
    return true;
  }

  return BOT_USER_AGENT_PATTERN.test(
    request.headers.get('user-agent') ?? '',
  );
}

function visitorKey(visitorId: string): string {
  return createHash('sha256')
    .update(
      `veinvite-usage-daily-visitor-v2\n${visitorId.toLowerCase()}`,
      'utf8',
    )
    .digest('hex');
}

function readBodyRecord(
  value: unknown,
): Record<string, unknown> | null {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return null;
  }
  return value as Record<string, unknown>;
}

async function excludeAdminVisitor(
  walletAddress: string,
  hashedVisitor: string,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('analytics_excluded_wallets')
    .select('wallet_address')
    .eq('wallet_address', walletAddress.trim().toLowerCase())
    .eq('active', true)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Analytics exclusion policy could not be checked: ${error.message}`,
    );
  }
  if (!data) return false;

  const { error: exclusionError } = await supabaseAdmin.rpc(
    'exclude_app_usage_visitor',
    { p_visitor_key: hashedVisitor },
  );
  if (exclusionError) {
    throw new Error(
      `Admin usage visitor could not be excluded: ${exclusionError.message}`,
    );
  }
  return true;
}

export async function POST(request: NextRequest) {
  if (shouldIgnoreRequest(request)) {
    return noStore();
  }
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

  const eventId =
    typeof record.eventId === 'string'
      ? record.eventId.trim()
      : '';
  const visitorId =
    typeof record.visitorId === 'string'
      ? record.visitorId.trim()
      : '';
  const sessionId =
    typeof record.sessionId === 'string'
      ? record.sessionId.trim()
      : '';
  const eventSequence = Number(record.eventSequence);
  const eventName =
    typeof record.eventName === 'string'
      ? record.eventName
      : '';
  const view =
    typeof record.view === 'string'
      ? record.view
      : '';
  const locale = record.locale;
  const device =
    typeof record.device === 'string'
      ? record.device
      : '';
  const source =
    typeof record.source === 'string'
      ? record.source
      : '';
  const outcome =
    typeof record.outcome === 'string'
      ? record.outcome
      : '';
  const failureCode =
    typeof record.failureCode === 'string'
      ? record.failureCode
      : '';
  const missionKey =
    typeof record.missionKey === 'string'
      ? record.missionKey
      : '';
  const flowKey =
    typeof record.flowKey === 'string'
      ? record.flowKey
      : '';
  const entryClass =
    typeof record.entryClass === 'string'
      ? record.entryClass
      : '';

  if (
    !UUID_PATTERN.test(eventId) ||
    !UUID_PATTERN.test(visitorId) ||
    !UUID_PATTERN.test(sessionId) ||
    !Number.isSafeInteger(eventSequence) ||
    eventSequence < 1 ||
    eventSequence > 10_000 ||
    !EVENT_NAMES.has(eventName) ||
    !USAGE_VIEWS.has(view) ||
    !isLocale(locale) ||
    !DEVICE_BUCKETS.has(device) ||
    !ACQUISITION_SOURCES.has(source) ||
    !OUTCOMES.has(outcome) ||
    !FAILURE_CODES.has(failureCode) ||
    !MISSION_KEYS.has(missionKey) ||
    !FLOW_KEYS.has(flowKey) ||
    !ENTRY_CLASSES.has(entryClass)
  ) {
    return noStore(400);
  }

  const hashedVisitor = visitorKey(visitorId);
  const ipSubject = getClientIpSubject(request);
  const limited = await enforceRateLimits([
    {
      scope: 'product-analytics-visitor',
      subject: hashedVisitor,
      limit: 300,
      windowSeconds: 60 * 60,
    },
    ipSubject
      ? {
          scope: 'product-analytics-ip',
          subject: ipSubject,
          limit: 2400,
          windowSeconds: 60 * 60,
        }
      : null,
  ]);
  if (limited) return limited;

  try {
    const walletSession = await getWalletSession(request);
    if (
      walletSession &&
      (await excludeAdminVisitor(
        walletSession.walletAddress,
        hashedVisitor,
      ))
    ) {
      return noStore();
    }
  } catch (error) {
    // Product analytics is observational only. A temporary wallet-session check
    // failure must never affect the product action the user just completed.
    console.warn(
      'Product analytics wallet-session/exclusion check failed:',
      error,
    );
  }

  const buildCandidate =
    (process.env.VERCEL_GIT_COMMIT_SHA ?? '')
      .trim()
      .toLowerCase();
  const buildId = /^[0-9a-f]{7,64}$/.test(buildCandidate)
    ? buildCandidate
    : 'unknown';

  const { error } = await supabaseAdmin.rpc(
    'record_app_product_event',
    {
      p_event_id: eventId.toLowerCase(),
      p_visitor_key: hashedVisitor,
      p_session_id: sessionId.toLowerCase(),
      p_event_sequence: eventSequence,
      p_event_name: eventName,
      p_view_name: view,
      p_locale: locale,
      p_device_bucket: device,
      p_acquisition_source: source,
      p_outcome: outcome,
      p_failure_code: failureCode,
      p_mission_key: missionKey,
      p_flow_key: flowKey,
      p_entry_class: entryClass,
      p_build_id: buildId,
      p_schema_version: 1,
    },
  );

  if (error) {
    console.error(
      'Product analytics event could not be stored:',
      error,
    );
    return noStore(503);
  }

  return noStore();
}
