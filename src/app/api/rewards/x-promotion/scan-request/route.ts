import { NextRequest, NextResponse } from 'next/server';

import { enforceRateLimits } from '@/lib/rateLimitServer';
import { getVeBetterNetworkConfig } from '@/lib/vebetter/network';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { requireWalletSession, WalletAuthenticationError } from '@/lib/walletAuthServer';

export const dynamic = 'force-dynamic';
const INVITE = /^[A-HJ-NP-Z2-9]{7}$/u;
const NO_STORE = { 'Cache-Control': 'no-store' };
function response(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: NO_STORE });
}

/**
 * Non-payment scan hint only. A click is not evidence of an X Post, and can
 * never change eligibility, expiry, reserved B3TR or Sybil state.
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (!origin || origin !== request.nextUrl.origin) {
    return response('Invalid request origin.', 403);
  }
  const cohortStartedAt = Date.parse(
    process.env.VEINVITE_X_PROMOTION_URLLESS_START_AT ?? '',
  );
  const dailyReads = process.env.VEINVITE_X_PROMOTION_DAILY_READ_CALLS ?? '';
  if (process.env.VEINVITE_X_PROMOTION_SCAN_HINT_ENABLED !== 'true' ||
      process.env.VEINVITE_X_PROMOTION_DISCOVERY_MODE !== 'live' ||
      process.env.VEINVITE_X_PROMOTION_DISCOVERY_STRATEGY !== 'author' ||
      !/^(?:[1-9]|1[0-9]|20)$/u.test(dailyReads) ||
      !Number.isFinite(cohortStartedAt) || cohortStartedAt <= 0) {
    return response('Scan requests are not available.', 503);
  }
  let raw: unknown;
  try { raw = await request.json(); }
  catch { return response('Invalid request.', 400); }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return response('Invalid request.', 400);
  }
  const inviteCode = String((raw as { inviteCode?: unknown }).inviteCode ?? '')
    .trim().toUpperCase();
  if (!INVITE.test(inviteCode)) return response('Invalid invite code.', 400);

  try {
    const { walletAddress } = await requireWalletSession({ request });
    const wallet = walletAddress.toLowerCase();
    const block = await enforceRateLimits([
      { scope: 'x_promotion_scan_hint_wallet', subject: wallet, limit: 5, windowSeconds: 3600 },
      { scope: 'x_promotion_scan_hint_invite', subject: inviteCode, limit: 3, windowSeconds: 3600 },
    ]);
    if (block) return block;

    const { network } = getVeBetterNetworkConfig();
    const [offer, oauth] = await Promise.all([
      supabaseAdmin.from('reward_x_promotion_opportunities')
        .select('invite_code,recipient_wallet,post_deadline_at,opened_at,obligation_id')
        .eq('invite_code', inviteCode).eq('network', network).maybeSingle(),
      supabaseAdmin.from('reward_x_promotion_oauth_proofs')
        .select('x_author_id').eq('network', network)
        .eq('recipient_wallet', wallet).maybeSingle(),
    ]);
    if (offer.error || oauth.error) throw new Error('Scan hint eligibility read failed.');
    const item = offer.data;
    if (!item || item.recipient_wallet !== wallet ||
        !oauth.data?.x_author_id ||
        Date.parse(item.post_deadline_at) <= Date.now() ||
        Date.parse(item.opened_at) >= Date.now() ||
        Date.parse(item.opened_at) < cohortStartedAt) {
      return response('No active, connected X promotion found.', 409);
    }
    const obligation = await supabaseAdmin.from('reward_x_promotion_obligations')
      .select('financial_state').eq('id', item.obligation_id).maybeSingle();
    if (obligation.error) throw new Error('Scan hint obligation lookup failed.');
    if (obligation.data?.financial_state !== 'HELD') {
      return response('The X bonus is not available for scanning.', 409);
    }

    // Ignore repeated button clicks: request priority is immutable until a
    // real server scan updates last_checked_at. The unique key is inviteCode.
    const recorded = await supabaseAdmin.from('reward_x_promotion_scan_requests')
      .upsert({
        invite_code: inviteCode,
        network,
        recipient_wallet: wallet,
      }, { onConflict: 'invite_code', ignoreDuplicates: true });
    if (recorded.error) throw new Error('Scan hint insert failed.');
    return NextResponse.json({ queued: true }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof WalletAuthenticationError) {
      return response(error.message, error.status);
    }
    console.error('X promotion scan request failed', error);
    return response('Could not queue an X scan. Try again later.', 503);
  }
}
