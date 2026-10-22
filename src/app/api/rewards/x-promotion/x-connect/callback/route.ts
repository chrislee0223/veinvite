import { NextRequest, NextResponse } from 'next/server';
import { reserveXApiReadBudget } from '@/lib/rewards/rewardXPromotionApiBudget';
import {
  equalXState, readXConnectState, xOAuthConfig, X_OAUTH_COOKIE,
} from '@/lib/rewards/rewardXPromotionOAuth';
import { getVeBetterNetworkConfig } from '@/lib/vebetter/network';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { requireWalletSession } from '@/lib/walletAuthServer';

export const dynamic = 'force-dynamic';
const X_ID = /^[0-9]{1,32}$/u;
const TIMEOUT_MS = 8_000;
const NO_STORE = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };

type TokenResponse = { access_token?: string; token_type?: string };
type UserResponse = { data?: { id?: string; protected?: boolean } };

function finish(request: NextRequest, status: string) {
  const url = new URL('/', request.nextUrl.origin);
  url.searchParams.set('xConnect', status);
  const response = NextResponse.redirect(url);
  // One-time verifier: remove even if token exchange or DB binding failed.
  response.cookies.set(X_OAUTH_COOKIE, '', {
    path: '/', httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax', maxAge: 0,
  });
  for (const [key, value] of Object.entries(NO_STORE)) response.headers.set(key, value);
  return response;
}

async function readJson<T>(url: string, init: RequestInit): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, cache: 'no-store' });
    if (!response.ok) return null;
    return await response.json() as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(request: NextRequest) {
  const config = xOAuthConfig(request.nextUrl.origin);
  if (!config) return finish(request, 'unavailable');

  const pending = readXConnectState(
    request.cookies.get(X_OAUTH_COOKIE)?.value, config.stateSecret,
  );
  const state = request.nextUrl.searchParams.get('state') ?? '';
  const code = request.nextUrl.searchParams.get('code') ?? '';

  if (!pending || !equalXState(pending.state, state) ||
      request.nextUrl.searchParams.has('error') ||
      code.length < 8 || code.length > 2048 ||
      /[\r\n]/u.test(code)
  ) return finish(request, 'invalid');

  try {
    const session = await requireWalletSession({ request });
    if (session.walletAddress.toLowerCase() !== pending.wallet) {
      return finish(request, 'wallet');
    }
    const { network } = getVeBetterNetworkConfig();
    const verifiedOffer = await supabaseAdmin
      .from('reward_x_promotion_opportunities')
      .select('recipient_wallet,policy_version')
      .eq('invite_code', pending.inviteCode)
      .eq('network', network).maybeSingle();
    if (verifiedOffer.error || verifiedOffer.data?.recipient_wallet !== pending.wallet ||
        typeof verifiedOffer.data.policy_version !== 'string' ||
        verifiedOffer.data.policy_version.length < 1 ||
        verifiedOffer.data.policy_version.length > 80) {
      return finish(request, 'offer');
    }

    const form = new URLSearchParams({
      code, grant_type: 'authorization_code',
      redirect_uri: config.callbackUri,
      code_verifier: pending.verifier,
    });
    const clientSecret = process.env.X_OAUTH_CLIENT_SECRET?.trim();
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    };
    if (clientSecret) {
      const basic = Buffer.from(`${config.clientId}:${clientSecret}`).toString('base64');
      headers.Authorization = `Basic ${basic}`;
    } else {
      // Public OAuth clients MUST submit their client id with PKCE.
      form.set('client_id', config.clientId);
    }

    const token = await readJson<TokenResponse>('https://api.x.com/2/oauth2/token', {
      method: 'POST', headers, body: form.toString(),
    });
    if (!token?.access_token || token.token_type?.toLowerCase() !== 'bearer') {
      return finish(request, 'provider');
    }
    // Reserve at most one billable User resource before querying /users/me.
    if (!await reserveXApiReadBudget('OAUTH_USER')) {
      return finish(request, 'unavailable');
    }
    // The OAuth access token is ephemeral and is never stored in logs,
    // cookies, or the database. Only the verified X user id is retained.
    const user = await readJson<UserResponse>(
      'https://api.x.com/2/users/me?user.fields=protected', {
        headers: { Authorization: `Bearer ${token.access_token}`, Accept: 'application/json' },
      },
    );
    const authorId = user?.data?.id;
    if (!authorId || !X_ID.test(authorId)) return finish(request, 'provider');
    // Privacy is explicitly requested from X; if missing, never assume a
    // protected or partial-profile account is suitable for a public campaign.
    if (user.data?.protected !== false) return finish(request, 'private');

    const existing = await supabaseAdmin
      .from('reward_x_promotion_x_identities')
      .select('x_author_id')
      .eq('network', network)
      .eq('recipient_wallet', pending.wallet).maybeSingle();
    if (existing.error) throw new Error('X account binding lookup failed.');
    if (existing.data?.x_author_id !== undefined && existing.data.x_author_id !== authorId) {
      return finish(request, 'conflict');
    }

    if (!existing.data) {
      // Existing manual-URL identity binding may be present already. Its
      // presence alone is NOT OAuth proof; first create or verify the identity.
      const inserted = await supabaseAdmin
        .from('reward_x_promotion_x_identities')
        .insert({
          network, recipient_wallet: pending.wallet,
          x_author_id: authorId,
          policy_version: verifiedOffer.data.policy_version,
          first_verified_at: new Date().toISOString(),
        });
      if (inserted.error) {
        if (inserted.error.code === '23505') return finish(request, 'conflict');
        throw new Error('X account binding insert failed.');
      }
    }

    // Only a completed provider OAuth flow can write this separate proof.
    // An unverified user-submitted URL must NEVER qualify for live discovery.
    const proof = await supabaseAdmin
      .from('reward_x_promotion_oauth_proofs')
      .select('x_author_id')
      .eq('network', network)
      .eq('recipient_wallet', pending.wallet)
      .maybeSingle();
    if (proof.error) throw new Error('X OAuth proof lookup failed.');
    if (proof.data) return finish(
      request, proof.data.x_author_id === authorId ? 'connected' : 'conflict',
    );

    const attested = await supabaseAdmin
      .from('reward_x_promotion_oauth_proofs')
      .insert({
        network,
        recipient_wallet: pending.wallet,
        x_author_id: authorId,
        proof_method: 'OAUTH2_PKCE',
      });
    if (attested.error) {
      if (attested.error.code === '23505') return finish(request, 'conflict');
      throw new Error('X OAuth proof persistence failed.');
    }
    return finish(request, 'connected');
  } catch (error) {
    console.error('X OAuth callback could not complete', {
      message: error instanceof Error ? error.message : 'unknown',
    });
    return finish(request, 'error');
  }
}
