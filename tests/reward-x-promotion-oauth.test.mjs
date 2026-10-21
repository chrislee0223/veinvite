import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = readFileSync(
  new URL('../src/lib/rewards/rewardXPromotionOAuth.ts', import.meta.url), 'utf8',
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function setup(config = {}) {
  const exports = {};
  const secret = 'one-very-long-random-looking-key-with-at-least-32-bytes';
  const env = {
    NODE_ENV: 'production',
    X_OAUTH_CLIENT_ID: 'test-client-id',
    X_OAUTH_STATE_SECRET: secret,
    X_OAUTH_REDIRECT_URI:
      'https://veinvite.vercel.app/api/rewards/x-promotion/x-connect/callback',
    ...config,
  };
  vm.runInNewContext(compiled, {
    exports, require(id) {
      if (id === 'server-only') return {};
      if (id === 'node:crypto') return require('node:crypto');
      throw new Error('Unexpected import: ' + id);
    },
    process: { env }, Buffer, URL, Date,
  });
  return { ...exports, secret };
}
const WALLET = '0x1111111111111111111111111111111111111111';
const INVITE = 'ABCDEFG';

test('OAuth disabled without all three server-only configuration inputs', () => {
  assert.equal(setup({ X_OAUTH_CLIENT_ID: '' }).xOAuthConfig('https://veinvite.vercel.app'), null);
  assert.equal(setup({ X_OAUTH_STATE_SECRET: 'tiny' }).xOAuthConfig('https://veinvite.vercel.app'), null);
  assert.equal(setup({ X_OAUTH_REDIRECT_URI: '' }).xOAuthConfig('https://veinvite.vercel.app'), null);
});

test('callback redirect URI must match the actual application origin/path exactly', () => {
  const oauth = setup();
  assert.ok(oauth.xOAuthConfig('https://veinvite.vercel.app'));
  assert.equal(oauth.xOAuthConfig('https://evil.example.com'), null);
  assert.equal(setup({ X_OAUTH_REDIRECT_URI: 'https://evil.example.com/api/rewards/x-promotion/x-connect/callback' }).xOAuthConfig('https://veinvite.vercel.app'), null);
  assert.equal(setup({ X_OAUTH_REDIRECT_URI: 'http://veinvite.vercel.app/api/rewards/x-promotion/x-connect/callback' }).xOAuthConfig('http://veinvite.vercel.app'), null);
});

test('authorization is code+PKCE S256 and read-only X scopes', () => {
  const oauth = setup();
  const state = oauth.createXConnectState(WALLET, INVITE);
  const config = oauth.xOAuthConfig('https://veinvite.vercel.app');
  const url = new URL(oauth.xAuthorizationUrl(config, state));
  assert.equal(url.origin, 'https://x.com');
  assert.equal(url.pathname, '/i/oauth2/authorize');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('scope'), 'tweet.read users.read');
  assert.equal(url.searchParams.get('state'), state.state);
  assert.notEqual(url.searchParams.get('code_challenge'), state.verifier);
  assert.equal(url.searchParams.has('client_secret'), false);
  assert.equal(url.searchParams.has('wallet'), false);
});

test('OAuth nonce/verifier are wallet-bound, signed and expire', () => {
  const oauth = setup();
  const state = oauth.createXConnectState(WALLET, INVITE);
  const cookie = oauth.signXConnectState(state, oauth.secret);
  const restored = oauth.readXConnectState(cookie, oauth.secret);
  assert.equal(restored.wallet, WALLET);
  assert.equal(restored.inviteCode, INVITE);
  assert.equal(restored.verifier, state.verifier);
  assert.equal(oauth.readXConnectState(cookie + 'corrupt', oauth.secret), null);
  assert.equal(oauth.readXConnectState(cookie, 'another-secret-that-is-longer-than-32-chars'), null);
  assert.equal(oauth.readXConnectState(undefined, oauth.secret), null);
  assert.equal(oauth.readXConnectState(oauth.signXConnectState({
    ...state, expiresAt: Date.now() - 1,
  }, oauth.secret), oauth.secret), null);
});

test('OAuth state token must match in constant-time comparison', () => {
  const oauth = setup();
  const state1 = oauth.createXConnectState(WALLET, INVITE);
  const state2 = oauth.createXConnectState(WALLET, INVITE);
  assert.equal(oauth.equalXState(state1.state, state1.state), true);
  assert.equal(oauth.equalXState(state1.state, state2.state), false);
  assert.equal(oauth.equalXState(state1.state, ''), false);
  assert.equal(oauth.equalXState('bad-state', 'bad-state'), false);
});

test('invalid recipient wallet and invite cannot start OAuth flow', () => {
  const oauth = setup();
  assert.throws(() => oauth.createXConnectState('0xnot-a-wallet', INVITE));
  assert.throws(() => oauth.createXConnectState(WALLET, 'not-a-valid-invite'));
  assert.equal(oauth.xConnectCookieOptions().httpOnly, true);
  assert.equal(oauth.xConnectCookieOptions().sameSite, 'lax');
  assert.equal(oauth.xConnectCookieOptions().secure, true);
});
