import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/supabaseServer';
import { enforceRateLimits, getClientIpSubject } from '@/lib/rateLimitServer';
import { getWalletSession } from '@/lib/walletAuthServer';
import { getVeBetterNetwork } from '@/lib/vebetter/network';
import { loadActiveSybilV2Restriction } from '@/lib/sybil/v2/restrictions';
import { readOwnHeldProgress } from '@/lib/sybil/v2/holdProgressPolicy';

export const dynamic = 'force-dynamic';

const HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
};

function result(
  value: Record<string, unknown>,
  status = 200,
) {
  return NextResponse.json(value, { status, headers: HEADERS });
}

/**
 * Read-only status for a verified HOLD wallet. Safe for a future restricted
 * screen to call. It does NOT lift participation restrictions or authorize
 * any transaction, reward, invite, promotion or review decision.
 */
export async function GET(request: NextRequest) {
  try {
    const ip = getClientIpSubject(request);
    const ipRateLimit = await enforceRateLimits([
      ip ? {
        scope: 'sybil_hold_progress_ip',
        subject: ip,
        limit: 30,
        windowSeconds: 60,
      } : null,
    ]);
    if (ipRateLimit) return ipRateLimit;

    const session = await getWalletSession(request);
    if (!session) {
      return result({ authenticated: false, progressAvailable: false }, 401);
    }

    const walletRateLimit = await enforceRateLimits([{
      scope: 'sybil_hold_progress_wallet',
      subject: session.walletAddress,
      limit: 12,
      windowSeconds: 60,
    }]);
    if (walletRateLimit) return walletRateLimit;

    const network = getVeBetterNetwork();
    const restriction = await loadActiveSybilV2Restriction({
      walletAddress: session.walletAddress,
      network,
    });

    // Fail closed: BLACKLIST, post-payout, inviter escalation and non-held
    // wallets must not use this restricted self-inspection path.
    if (
      restriction?.restriction_kind !== 'PRE_CLAIM_HOLD' ||
      !restriction.related_invite_code ||
      !/^[A-HJ-NP-Z2-9]{7}$/.test(restriction.related_invite_code)
    ) {
      return result({ authenticated: true, progressAvailable: false }, 403);
    }

    const inviteCode = restriction.related_invite_code;
    const [invitation, assessment] = await Promise.all([
      supabaseAdmin
        .from('invitations')
        .select('invite_code,invitee_wallet,activation_network,apps_completed,rewards_received,vot3_converted,vote_completed')
        .eq('invite_code', inviteCode)
        .eq('invitee_wallet', session.walletAddress)
        .eq('activation_network', network)
        .maybeSingle(),
      supabaseAdmin
        .from('sybil_v2_referral_assessments')
        .select('invite_code,network,state')
        .eq('invite_code', inviteCode)
        .eq('network', network)
        .maybeSingle(),
    ]);
    if (invitation.error || assessment.error) {
      throw new Error('HOLD progress could not be loaded.');
    }

    const view = readOwnHeldProgress({
      restrictionKind: restriction.restriction_kind,
      activeHoldInviteCode: inviteCode,
      invitationInviteCode: invitation.data?.invite_code ?? null,
      inviteeWallet: invitation.data?.invitee_wallet ?? null,
      verifiedWallet: session.walletAddress,
      networkMatches:
        invitation.data?.activation_network === network &&
        assessment.data?.network === network,
      assessmentState: assessment.data?.state ?? null,
      appsCompleted: invitation.data?.apps_completed,
      rewardsReceived: invitation.data?.rewards_received,
      vot3Converted: invitation.data?.vot3_converted,
      voteCompleted: invitation.data?.vote_completed,
    });

    if (!view) {
      return result({ authenticated: true, progressAvailable: false }, 409);
    }

    // An operator could have blacklisted the wallet while we fetched its
    // progress. Recheck at response time; no stale snapshot may bypass it.
    const finalRestriction = await loadActiveSybilV2Restriction({
      walletAddress: session.walletAddress,
      network,
    });
    if (
      finalRestriction?.restriction_kind !== 'PRE_CLAIM_HOLD' ||
      finalRestriction.related_invite_code !== inviteCode
    ) {
      return result({ authenticated: true, progressAvailable: false }, 409);
    }

    return result({
      authenticated: true,
      progressAvailable: true,
      ...view,
    });
  } catch (error) {
    console.error('Failed to inspect held mission progress:', error);
    return result({
      error: 'Unable to verify review progress right now.',
      progressAvailable: false,
    }, 503);
  }
}
