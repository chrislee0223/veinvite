import { NextRequest, NextResponse } from 'next/server';

import {
  enforceRateLimits,
  getClientIpSubject,
} from '@/lib/rateLimitServer';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { loadActiveSybilV2Restriction } from '@/lib/sybil/v2/restrictions';
import { getVeBetterNetwork } from '@/lib/vebetter/network';
import { getWalletSession } from '@/lib/walletAuthServer';

export const dynamic = 'force-dynamic';

const HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
};
const INTENT = 'REQUEST_SYBIL_REVIEW';
const VALID_CATEGORIES = new Set([
  'DISTINCT_PERSON_SHARED_DEVICE',
  'INCORRECT_IDENTITY_LINK',
  'MISSING_ACTIVITY',
  'OTHER',
]);

function reply(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: HEADERS });
}

function sameOriginWithExplicitIntent(request: NextRequest) {
  if (request.headers.get('x-veinvite-appeal-intent') !== INTENT) {
    return false;
  }
  const origin = request.headers.get('origin');
  if (!origin) {
    // Native wallet webviews may omit Origin. A cross-site HTML form cannot
    // send the non-safelisted intent header, and CORS is not enabled here.
    return true;
  }
  try {
    return new URL(origin).origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!sameOriginWithExplicitIntent(request)) {
    return reply({ error: 'Invalid request origin.' }, 403);
  }

  const ip = getClientIpSubject(request);
  const ipLimit = await enforceRateLimits([
    ip ? {
      scope: 'sybil_appeal_ip',
      subject: ip,
      limit: 8,
      windowSeconds: 3600,
    } : null,
  ]);
  if (ipLimit) return ipLimit;

  try {
    const session = await getWalletSession(request);
    if (!session) {
      return reply({ authenticated: false, received: false }, 401);
    }

    const expectedWallet = request.headers
      .get('x-veinvite-session-wallet')
      ?.trim()
      .toLowerCase();
    if (
      !expectedWallet ||
      !/^0x[0-9a-f]{40}$/.test(expectedWallet) ||
      expectedWallet !== session.walletAddress
    ) {
      return reply({ authenticated: true, received: false }, 403);
    }

    const walletLimit = await enforceRateLimits([{
      scope: 'sybil_appeal_wallet',
      subject: session.walletAddress,
      limit: 3,
      windowSeconds: 86_400,
    }]);
    if (walletLimit) return walletLimit;

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return reply({ error: 'Invalid request.' }, 400);
    }
    if (!payload || typeof payload !== 'object') {
      return reply({ error: 'Invalid request.' }, 400);
    }

    const input = payload as Record<string, unknown>;
    const category = input.category;
    const explanation = input.explanation;
    if (
      typeof category !== 'string' ||
      !VALID_CATEGORIES.has(category) ||
      typeof explanation !== 'string' ||
      explanation.trim().length < 25 ||
      explanation.trim().length > 600
    ) {
      return reply({ error: 'Invalid review details.' }, 400);
    }

    const network = getVeBetterNetwork();
    const restriction = await loadActiveSybilV2Restriction({
      walletAddress: session.walletAddress,
      network,
    });

    if (
      (restriction?.restriction_kind !== 'BLACKLIST' &&
        restriction?.restriction_kind !== 'PRE_CLAIM_HOLD') ||
      !restriction.related_invite_code ||
      !/^[A-HJ-NP-Z2-9]{7}$/.test(restriction.related_invite_code)
    ) {
      return reply({ authenticated: true, received: false }, 403);
    }

    const code = restriction.related_invite_code;
    const { data: assessment, error: assessmentError } =
      await supabaseAdmin
        .from('sybil_v2_referral_assessments')
        .select('revision,network,state')
        .eq('invite_code', code)
        .eq('network', network)
        .maybeSingle();

    if (assessmentError) {
      throw new Error('Appeal assessment lookup failed.');
    }
    const revision = Number(assessment?.revision);
    if (
      !Number.isSafeInteger(revision) ||
      revision < 1 ||
      (restriction.restriction_kind === 'BLACKLIST' &&
        assessment?.state !== 'RESTRICTED') ||
      (restriction.restriction_kind === 'PRE_CLAIM_HOLD' &&
        assessment?.state !== 'HOLD')
    ) {
      return reply({ received: false, error: 'Review state changed.' }, 409);
    }

    // DB RPC atomically re-checks the active restriction, invitee ownership
    // and assessment revision. A pending appeal never grants any privilege.
    const { data, error } = await supabaseAdmin.rpc(
      'submit_sybil_v2_appeal',
      {
        p_invite_code: code,
        p_network: network,
        p_wallet_address: session.walletAddress,
        p_expected_revision: revision,
        p_category: category,
        p_explanation: explanation.trim(),
      },
    );

    if (error) {
      if (
        error.message.includes('SYBIL_APPEAL_CASE_CHANGED') ||
        error.message.includes('SYBIL_APPEAL_NO_ACTIVE_CASE')
      ) {
        return reply({ received: false, error: 'Review state changed.' }, 409);
      }
      throw new Error('Appeal persistence unavailable.');
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (
      !row ||
      typeof row.submitted !== 'boolean' ||
      typeof row.already_submitted !== 'boolean'
    ) {
      throw new Error('Appeal result was malformed.');
    }

    return reply({
      received: true,
      status: 'PENDING',
      alreadySubmitted: row.already_submitted,
      reviewOnly: true,
      restrictionUnchanged: true,
      rewardUnchanged: true,
    }, row.submitted ? 202 : 200);
  } catch (error) {
    console.error('Verified Sybil review request failed:', error);
    return reply({
      received: false,
      error: 'Unable to submit review request right now.',
    }, 503);
  }
}
