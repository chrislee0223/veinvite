import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimits } from '@/lib/rateLimitServer';
import {
  createXConnectState, signXConnectState, xAuthorizationUrl,
  xConnectCookieOptions, xOAuthConfig, X_OAUTH_COOKIE,
} from '@/lib/rewards/rewardXPromotionOAuth';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { requireWalletSession, WalletAuthenticationError } from '@/lib/walletAuthServer';

export const dynamic = 'force-dynamic';
const INVITE = /^[A-HJ-NP-Z2-9]{7}$/u;

export async function GET(request: NextRequest) {
  const config = xOAuthConfig(request.nextUrl.origin);
  if (!config) return NextResponse.json(
    { error: 'X account connection has not been configured.' },
    { status: 503, headers: { 'Cache-Control': 'no-store' } },
  );
  const inviteCode = request.nextUrl.searchParams.get('inviteCode')?.trim().toUpperCase() ?? '';
  if (!INVITE.test(inviteCode)) return NextResponse.json(
    { error: 'Invalid invite code.' },
    { status: 400, headers: { 'Cache-Control': 'no-store' } },
  );

  try {
    const session = await requireWalletSession({ request });
    const wallet = session.walletAddress.toLowerCase();
    const blocked = await enforceRateLimits([
      { scope: 'x_promotion_oauth_start_wallet', subject: wallet, limit: 5, windowSeconds: 600 },
      { scope: 'x_promotion_oauth_start_invite', subject: inviteCode, limit: 5, windowSeconds: 600 },
    ]);
    if (blocked) return blocked;

    const opportunity = await supabaseAdmin
      .from('reward_x_promotion_opportunities')
      .select('recipient_wallet,post_deadline_at')
      .eq('invite_code', inviteCode).maybeSingle();
    if (opportunity.error) throw new Error('X promotion opportunity lookup failed.');
    if (!opportunity.data ||
      opportunity.data.recipient_wallet !== wallet ||
      Date.parse(opportunity.data.post_deadline_at) <= Date.now()
    ) return NextResponse.json(
      { error: 'No active X promotion belongs to the verified wallet.' },
      { status: 409, headers: { 'Cache-Control': 'no-store' } },
    );

    const state = createXConnectState(wallet, inviteCode);
    const response = NextResponse.redirect(xAuthorizationUrl(config, state));
    response.cookies.set(
      X_OAUTH_COOKIE, signXConnectState(state, config.stateSecret), xConnectCookieOptions(),
    );
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('Referrer-Policy', 'no-referrer');
    return response;
  } catch (error) {
    if (error instanceof WalletAuthenticationError) return NextResponse.json(
      { error: error.message },
      { status: error.status, headers: { 'Cache-Control': 'no-store' } },
    );
    console.error('X OAuth start failed', error);
    return NextResponse.json({ error: 'Unable to start X account connection.' }, {
      status: 500, headers: { 'Cache-Control': 'no-store' },
    });
  }
}
