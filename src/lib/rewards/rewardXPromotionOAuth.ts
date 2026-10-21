import 'server-only';

import {
  createHash, createHmac, randomBytes, timingSafeEqual,
} from 'node:crypto';

export const X_OAUTH_COOKIE = process.env.NODE_ENV === 'production'
  ? '__Host-veinvite_x_connect'
  : 'veinvite_x_connect';
const CALLBACK_PATH = '/api/rewards/x-promotion/x-connect/callback';
const INVITE = /^[A-HJ-NP-Z2-9]{7}$/u;
const WALLET = /^0x[0-9a-f]{40}$/u;
const STATE = /^[A-Za-z0-9_-]{32,96}$/u;
const VERIFIER = /^[A-Za-z0-9_-]{43,128}$/u;
const LIFETIME_MS = 10 * 60 * 1000;

export type XConnectState = {
  state: string;
  verifier: string;
  inviteCode: string;
  wallet: string;
  expiresAt: number;
};

export function xOAuthConfig(expectedOrigin: string) {
  const clientId = process.env.X_OAUTH_CLIENT_ID?.trim() ?? '';
  const stateSecret = process.env.X_OAUTH_STATE_SECRET?.trim() ?? '';
  const callbackUri = process.env.X_OAUTH_REDIRECT_URI?.trim() ?? '';
  if (!clientId || stateSecret.length < 32 || !callbackUri) return null;

  try {
    const callback = new URL(callbackUri);
    const origin = new URL(expectedOrigin);
    if (callback.pathname !== CALLBACK_PATH ||
      callback.search || callback.hash || callback.origin !== origin.origin ||
      !['https:', 'http:'].includes(callback.protocol) ||
      (process.env.NODE_ENV === 'production' && callback.protocol !== 'https:')
    ) return null;
    return { clientId, stateSecret, callbackUri };
  } catch {
    return null;
  }
}

export function createXConnectState(wallet: string, inviteCode: string): XConnectState {
  if (!WALLET.test(wallet) || !INVITE.test(inviteCode)) {
    throw new Error('Invalid wallet or invite code for X connection.');
  }
  return {
    state: randomBytes(32).toString('base64url'),
    verifier: randomBytes(48).toString('base64url'),
    inviteCode,
    wallet: wallet.toLowerCase(),
    expiresAt: Date.now() + LIFETIME_MS,
  };
}

export function xAuthorizationUrl(config: {
  clientId: string;
  callbackUri: string;
}, state: XConnectState): string {
  const challenge = createHash('sha256')
    .update(state.verifier).digest('base64url');
  const url = new URL('https://x.com/i/oauth2/authorize');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.callbackUri);
  url.searchParams.set('scope', 'tweet.read users.read');
  url.searchParams.set('state', state.state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

export function signXConnectState(state: XConnectState, secret: string): string {
  const encoded = Buffer.from(JSON.stringify(state)).toString('base64url');
  const signature = createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

export function readXConnectState(cookie: string | undefined, secret: string): XConnectState | null {
  if (!cookie || cookie.length > 1500 || !secret || cookie.split('.').length !== 2) return null;
  const [encoded, mac] = cookie.split('.');
  if (!encoded || !mac) return null;
  const calculated = createHmac('sha256', secret)
    .update(encoded).digest();
  let supplied: Buffer;
  try { supplied = Buffer.from(mac, 'base64url'); } catch { return null; }
  if (supplied.length !== calculated.length || !timingSafeEqual(calculated, supplied)) return null;

  try {
    const value = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Partial<XConnectState>;
    if (typeof value.state !== 'string' || !STATE.test(value.state) ||
      typeof value.verifier !== 'string' || !VERIFIER.test(value.verifier) ||
      typeof value.inviteCode !== 'string' || !INVITE.test(value.inviteCode) ||
      typeof value.wallet !== 'string' || !WALLET.test(value.wallet) ||
      typeof value.expiresAt !== 'number' ||
      !Number.isSafeInteger(value.expiresAt) ||
      value.expiresAt <= Date.now() ||
      value.expiresAt > Date.now() + LIFETIME_MS
    ) return null;
    return value as XConnectState;
  } catch {
    return null;
  }
}

export function equalXState(left: string, right: string) {
  if (!STATE.test(left) || !STATE.test(right)) return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function xConnectCookieOptions() {
  return {
    httpOnly: true as const,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 600,
  };
}
