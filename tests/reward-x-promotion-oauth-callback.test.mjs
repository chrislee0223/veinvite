import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const base = new URL('../src/', import.meta.url);
const WALLET = '0x1111111111111111111111111111111111111111';
const SECOND = '0x2222222222222222222222222222222222222222';
const INVITE = 'ABCDEFG';
const CALLBACK = 'https://veinvite.vercel.app/api/rewards/x-promotion/x-connect/callback';

function compile(relative) {
  const source = readFileSync(new URL(relative, base), 'utf8');
  return ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}
const oauthCompiled = compile('lib/rewards/rewardXPromotionOAuth.ts');
const callbackCompiled = compile('app/api/rewards/x-promotion/x-connect/callback/route.ts');

function setup({
  sessionWallet = WALLET, stateOverride = null,
  privateAccount = false, existingAuthor = null,
  returnedAuthor = '1234567890', noSession = false,
  insertConflict = false, proofConflict = false, proofAuthor = null, offerWallet = WALLET,
} = {}) {
  const env = {
    NODE_ENV: 'production', X_OAUTH_CLIENT_ID: 'oauth-client',
    X_OAUTH_STATE_SECRET: 'a-random-long-secret-with-32-characters-and-more',
    X_OAUTH_REDIRECT_URI: CALLBACK,
  };
  const oauth = {};
  vm.runInNewContext(oauthCompiled, {
    exports: oauth, Buffer, Date, URL,
    process: { env }, require(id) {
      if (id === 'server-only') return {};
      if (id === 'node:crypto') return require('node:crypto');
      throw new Error(id);
    },
  });

  const flow = oauth.createXConnectState(WALLET, INVITE);
  const cookie = oauth.signXConnectState(flow, env.X_OAUTH_STATE_SECRET);
  const url = new URL(CALLBACK);
  url.searchParams.set('state', stateOverride ?? flow.state);
  url.searchParams.set('code', 'OAuth-code-from-X-12345');
  const stats = { tokenCalls: 0, meCalls: 0, insertCount: 0, proofWrites: 0 };
  const supabaseAdmin = {
    from(table) {
      if (table === 'reward_x_promotion_opportunities') {
        return {
          select() { return this; }, eq() { return this; },
          async maybeSingle() { return { data: { recipient_wallet: offerWallet, policy_version: 'x-promotion-additive-v2' }, error: null }; },
        };
      }
      if (table === 'reward_x_promotion_oauth_proofs') {
        return {
          select() { return this; }, eq() { return this; },
          async maybeSingle() {
            return { data: proofAuthor ? { x_author_id: proofAuthor } : null, error: null };
          },
          async insert(value) {
            stats.proofWrites++;
            assert.equal(value.recipient_wallet, WALLET);
            assert.equal(value.x_author_id, returnedAuthor);
            assert.equal(value.proof_method, 'OAUTH2_PKCE');
            return { error: proofConflict ? { code: '23505', message: 'proof conflict' } : null };
          },
        };
      }
      assert.equal(table, 'reward_x_promotion_x_identities');
      return {
        select() { return this; }, eq() { return this; },
        async maybeSingle() {
          return { data: existingAuthor ? { x_author_id: existingAuthor } : null, error: null };
        },
        async insert(_value) {
          stats.insertCount++;
          assert.equal(_value.recipient_wallet, WALLET);
          assert.equal(_value.x_author_id, returnedAuthor);
          assert.equal(_value.policy_version, 'x-promotion-additive-v2');
          return { error: insertConflict ? { code: '23505', message: 'duplicate' } : null };
        },
      };
    },
  };
  const exports = {};
  vm.runInNewContext(callbackCompiled, {
    exports, Buffer, Date, URL, URLSearchParams, AbortController,
    setTimeout, clearTimeout, console: { error() {} }, process: { env },
    require(id) {
      if (id === 'next/server') return {
        NextResponse: {
          redirect(value) {
            const output = {
              redirectUrl: String(value),
              cookies: { set(...args) { output.cookieSet = args; } },
              headers: { set() {} },
            };
            return output;
          },
        },
      };
      if (id === '@/lib/rewards/rewardXPromotionOAuth') return oauth;
      if (id === '@/lib/vebetter/network') return {
        getVeBetterNetworkConfig: () => ({ network: 'mainnet' }),
      };
      if (id === '@/lib/supabaseServer') return { supabaseAdmin };
      if (id === '@/lib/walletAuthServer') return {
        async requireWalletSession() {
          if (noSession) throw new Error('no session');
          return { walletAddress: sessionWallet };
        },
      };
      throw new Error(id);
    },
    fetch: async (resource, init) => {
      if (String(resource).endsWith('/2/oauth2/token')) {
        stats.tokenCalls++;
        assert.equal(init.method, 'POST');
        assert.ok(init.body.includes('code_verifier='));
        return { ok: true, async json() { return { access_token: 'temporary-oauth-token', token_type: 'bearer' }; } };
      }
      assert.match(String(resource), /\/2\/users\/me\?/);
      stats.meCalls++;
      assert.equal(init.headers.Authorization, 'Bearer temporary-oauth-token');
      return { ok: true, async json() { return { data: { id: returnedAuthor, protected: privateAccount } }; } };
    },
  });
  const request = {
    nextUrl: url,
    cookies: { get(name) {
      assert.match(name, /x_connect/);
      return { value: cookie };
    } },
  };
  return { run: () => exports.GET(request), stats };
}

function status(response) {
  const url = new URL(response.redirectUrl);
  assert.equal(url.origin, 'https://veinvite.vercel.app');
  assert.equal(url.pathname, '/');
  assert.equal(response.cookieSet[1], '');
  assert.equal(response.cookieSet[2].maxAge, 0);
  return url.searchParams.get('xConnect');
}

test('valid OAuth result immutably binds verified X author to wallet', async () => {
  const x = setup();
  assert.equal(status(await x.run()), 'connected');
  assert.equal(x.stats.tokenCalls, 1);
  assert.equal(x.stats.meCalls, 1);
  assert.equal(x.stats.insertCount, 1);
  assert.equal(x.stats.proofWrites, 1);
});

test('state mismatch is rejected before any X API call', async () => {
  const x = setup({ stateOverride: 'invalid-oauth-state' });
  assert.equal(status(await x.run()), 'invalid');
  assert.equal(x.stats.tokenCalls, 0);
  assert.equal(x.stats.insertCount, 0);
});

test('wallet change during OAuth callback prevents binding', async () => {
  const x = setup({ sessionWallet: SECOND });
  assert.equal(status(await x.run()), 'wallet');
  assert.equal(x.stats.tokenCalls, 0);
  assert.equal(x.stats.insertCount, 0);
});

test('expired or revoked wallet session prevents binding', async () => {
  const x = setup({ noSession: true });
  assert.equal(status(await x.run()), 'error');
  assert.equal(x.stats.tokenCalls, 0);
  assert.equal(x.stats.insertCount, 0);
});

test('private X accounts cannot be linked for public Post rewards', async () => {
  const x = setup({ privateAccount: true });
  assert.equal(status(await x.run()), 'private');
  assert.equal(x.stats.insertCount, 0);
});

test('existing wallet cannot silently rebind to different X account', async () => {
  const x = setup({ existingAuthor: '99999999' });
  assert.equal(status(await x.run()), 'conflict');
  assert.equal(x.stats.insertCount, 0);
});

test('existing matching wallet-author pair is idempotent', async () => {
  const x = setup({ existingAuthor: '1234567890' });
  assert.equal(status(await x.run()), 'connected');
  assert.equal(x.stats.insertCount, 0);
  assert.equal(x.stats.proofWrites, 1);
});

test('another wallet already holding author id causes DB conflict', async () => {
  const x = setup({ insertConflict: true });
  assert.equal(status(await x.run()), 'conflict');
  assert.equal(x.stats.insertCount, 1);
});

test('opportunity owner mismatch aborts before OAuth token exchange', async () => {
  const x = setup({ offerWallet: SECOND });
  assert.equal(status(await x.run()), 'offer');
  assert.equal(x.stats.tokenCalls, 0);
});

test('existing manual URL binding upgrades only after real provider OAuth', async () => {
  const x = setup({ existingAuthor: '1234567890' });
  assert.equal(status(await x.run()), 'connected');
  assert.equal(x.stats.insertCount, 0);
  assert.equal(x.stats.proofWrites, 1);
});

test('verified OAuth proof can be replayed idempotently but not rewritten', async () => {
  const x = setup({ existingAuthor: '1234567890', proofAuthor: '1234567890' });
  assert.equal(status(await x.run()), 'connected');
  assert.equal(x.stats.proofWrites, 0);
});

test('stored OAuth proof for another X author fails closed', async () => {
  const x = setup({ existingAuthor: '1234567890', proofAuthor: '9999999999' });
  assert.equal(status(await x.run()), 'conflict');
  assert.equal(x.stats.proofWrites, 0);
});

test('a conflicting OAuth proof cannot be silently overwritten', async () => {
  const x = setup({ proofConflict: true });
  assert.equal(status(await x.run()), 'conflict');
  assert.equal(x.stats.proofWrites, 1);
});
