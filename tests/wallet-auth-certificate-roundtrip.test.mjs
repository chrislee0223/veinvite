import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { Certificate } from '@vechain/sdk-core';
import { getBytes, Wallet, verifyMessage, verifyTypedData } from 'ethers';
import ts from 'typescript';

import {
  verifyVeWorldCertificate,
  diagnoseVeWorldCertificateSignature,
} from '../src/lib/walletCertificateVerification.ts';
import {
  isWalletChallengeRequestBody,
  isWalletVerifyRequestBody,
  isWalletSessionRenewalRequestBody,
} from '../src/lib/walletAuthRequestValidation.ts';
import { walletChallengeTraceId } from '../src/lib/walletChallengeTrace.ts';
import { buildWalletAuthTypedData } from '../src/lib/walletAuthTypedData.ts';

// Test-only deterministic key, publicly known and never used on any chain.
// No RPC, wallet connector, real Supabase or production credential is loaded.
const KEY = '0x' + '12'.repeat(32);
const WALLET = new Wallet(KEY);
const ORIGIN = 'https://isolated-wallet-test.example';
const WALLET_COOKIE = '__Host-veinvite_session';

function loadRoute(file, mocks) {
  const source = readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  const script = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const module = { exports: {} };
  runInNewContext(script, {
    module,
    exports: module.exports,
    require: (name) => {
      assert.ok(Object.hasOwn(mocks, name), 'Unknown module ' + name);
      return mocks[name];
    },
    Date, URL, Buffer, Number, Array, console: {
      warn: () => {},
      info: () => {},
      error: () => {},
    },
    process: { env: { NODE_ENV: 'production', VERCEL_ENV: 'preview' } },
  }, { filename: file });
  return module.exports;
}

function harness() {
  const challenges = [];
  const sessions = [];
  const writes = [];
  let network = 'testnet';
  let nextId = 1;

  const matches = (row, filters) => filters.every(({ kind, column, value }) => {
    const actual = row[column];
    if (kind === 'eq') return actual === value;
    if (kind === 'is') return actual === value;
    if (kind === 'gt') return actual > value;
    if (kind === 'lte') return actual <= value;
    throw Error('Unknown filter ' + kind);
  });

  function challengeQuery(operation) {
    const filters = [];
    const query = {
      eq(column, value) { filters.push({ kind: 'eq', column, value }); return this; },
      is(column, value) { filters.push({ kind: 'is', column, value }); return this; },
      gt(column, value) { filters.push({ kind: 'gt', column, value }); return this; },
      lte(column, value) { filters.push({ kind: 'lte', column, value }); return this; },
      order() { return this; },
      limit() { return this; },
      maybeSingle: async () => ({
        data: [...challenges].reverse().find((row) => matches(row, filters)) ?? null,
        error: null,
      }),
      then(onFulfilled, onRejected) {
        if (operation !== 'delete') throw Error('Unexpected awaited query');
        writes.push({ table: 'wallet_auth_challenges', operation: 'expired-cleanup' });
        for (let i = challenges.length - 1; i >= 0; i--) {
          if (matches(challenges[i], filters)) challenges.splice(i, 1);
        }
        return Promise.resolve({ error: null }).then(onFulfilled, onRejected);
      },
    };
    return query;
  }

  const supabaseAdmin = {
    from(table) {
      assert.equal(table, 'wallet_auth_challenges', 'No production/bonus tables may be accessed');
      return {
        select: () => challengeQuery('select'),
        delete: () => challengeQuery('delete'),
        insert: async (row) => {
          writes.push({ table, operation: 'challenge-insert' });
          challenges.push({ id: nextId++, used_at: null, ...row });
          return { error: null };
        },
      };
    },
    async rpc(name, args) {
      assert.equal(name, 'issue_wallet_session_after_verified_challenge');
      writes.push({ table: 'wallet_auth_sessions', operation: 'atomic-issue' });
      const row = challenges.find((item) => item.id === args.p_challenge_id);
      if (
        !row || row.used_at !== null ||
        row.wallet_address !== args.p_wallet_address ||
        row.expires_at <= args.p_used_at
      ) return { data: false, error: null };
      row.used_at = args.p_used_at;
      sessions.push({
        wallet_address: args.p_wallet_address,
        token_hash: args.p_token_hash,
        expires_at: args.p_expires_at,
        revoked_at: null,
      });
      return { data: true, error: null };
    },
  };

  const NextResponse = {
    json(body, options = {}) {
      const cookieRows = [];
      return {
        body,
        status: options.status ?? 200,
        headers: options.headers ?? {},
        cookies: {
          set: (cookie) => { cookieRows.push(cookie); },
        },
        cookieRows,
      };
    },
  };
  const normalizeAddress = (value) => String(value).trim().toLowerCase();
  const mocks = {
    'node:crypto': { createHash, randomBytes },
    'next/server': { NextResponse },
    ethers: { verifyMessage, verifyTypedData },
    '@/lib/rateLimitServer': {
      getClientIpSubject: () => null,
      enforceRateLimits: async () => null,
    },
    '@/lib/serverStore': { normalizeAddress },
    '@/lib/walletAuthRequestValidation': {
      isWalletChallengeRequestBody, isWalletVerifyRequestBody, isWalletSessionRenewalRequestBody,
    },
    '@/lib/supabaseServer': { supabaseAdmin },
    '@/lib/vebetter/network': {
      getVeBetterNetworkConfig: () => ({ network }),
    },
    '@/lib/walletAuthTypedData': { buildWalletAuthTypedData },
    '@/lib/walletAuthFailureCodes': {
      walletVerifyFailureCodeForMessage: () => 'INVALID_PROOF',
    },
    '@/lib/walletChallengeTrace': { walletChallengeTraceId },
    '@/lib/walletCertificateVerification': {
      verifyVeWorldCertificate, diagnoseVeWorldCertificateSignature,
    },
    '@/lib/walletAuthServer': {
      WALLET_SESSION_COOKIE_NAME: WALLET_COOKIE,
      LEGACY_WALLET_SESSION_COOKIE_NAME: 'veinvite_session',
      getWalletSessionCookieCount: (request) =>
        request.cookies.getAll(WALLET_COOKIE).length,
      getWalletSession: async (request) => {
        const token = request.cookies.getAll(WALLET_COOKIE)[0]?.value;
        if (!token) return null;
        const hash = createHash('sha256').update(token).digest('hex');
        const row = sessions.find((s) =>
          s.token_hash === hash && s.revoked_at === null && s.expires_at > new Date().toISOString());
        return row ? { id: 1, walletAddress: row.wallet_address, expiresAt: row.expires_at } : null;
      },
      revokeWalletSession: async (request) => {
        for (const cookie of request.cookies.getAll(WALLET_COOKIE)) {
          const hash = createHash('sha256').update(cookie.value).digest('hex');
          const row = sessions.find((s) => s.token_hash === hash);
          if (row) row.revoked_at = new Date().toISOString();
        }
      },
      readWalletSessionTokens: (request) => request.cookies.getAll(WALLET_COOKIE).map((x) => x.value),
    },
    '@/lib/securityClientServer': { ensureSecurityClientForWallet: async () => {} },
    '@/lib/securityClientBestEffort': {
      settleOptionalSecurityObservation: async () => 'ok',
    },
  };

  const challengeRoute = loadRoute('src/app/api/auth/challenge/route.ts', mocks);
  const verifyRoute = loadRoute('src/app/api/auth/verify/route.ts', mocks);
  const sessionRoute = loadRoute('src/app/api/auth/session/route.ts', mocks);

  function request(route, body, token = null) {
    const cookieRows = token ? [{ name: WALLET_COOKIE, value: token }] : [];
    return {
      nextUrl: new URL(ORIGIN + '/api/auth/' + route),
      headers: { get: () => null },
      json: async () => body,
      cookies: { getAll: (name) => cookieRows.filter((item) => item.name === name) },
    };
  }

  function sign(challenge, key = KEY, domain = new URL(ORIGIN).host) {
    const wallet = new Wallet(key);
    const signed = Certificate.of({
      purpose: 'agreement',
      payload: { type: 'text', content: challenge.message },
      domain,
      timestamp: Math.floor(Date.now() / 1000),
      signer: wallet.address,
    });
    signed.sign(getBytes(key));
    return {
      purpose: signed.purpose,
      payload: signed.payload,
      domain: signed.domain,
      timestamp: signed.timestamp,
      signer: signed.signer,
      signature: signed.signature,
    };
  }

  return {
    issue: () => challengeRoute.POST(request('challenge', { walletAddress: WALLET.address })),
    verify: (body) => verifyRoute.POST(request('verify', body)),
    readSession: (token) => sessionRoute.GET(request('session', null, token)),
    revokeSession: (token) => sessionRoute.DELETE(request('session', null, token)),
    sign,
    challenges,
    sessions,
    writes,
    setNetwork: (value) => { network = value; },
  };
}

test('testnet challenge -> genuinely signed certificate -> atomic session cookie -> logout (isolated store)', async () => {
  const h = harness();
  const fresh = await h.issue();
  assert.equal(fresh.status, 201);
  assert.equal(fresh.body.network, 'testnet');
  assert.match(fresh.body.message, /Network: testnet/);
  assert.match(fresh.body.nonce, /^[0-9a-f]{64}$/);
  assert.equal((await h.issue()).body.nonce, fresh.body.nonce, 'active challenge must be reused');
  const proof = {
    walletAddress: WALLET.address,
    nonce: fresh.body.nonce,
    proofType: 'certificate',
    certificate: h.sign(fresh.body),
  };
  const verified = await h.verify(proof);
  assert.equal(verified.status, 201);
  assert.equal(verified.body.walletAddress, WALLET.address.toLowerCase());
  const cookie = verified.cookieRows.find((item) => item.name === WALLET_COOKIE);
  assert.ok(cookie?.value);
  assert.equal(cookie.httpOnly, true);
  assert.equal(cookie.secure, true);
  assert.equal(cookie.sameSite, 'lax');
  assert.equal(cookie.path, '/');
  assert.equal(h.sessions.length, 1);
  assert.equal(
    h.sessions[0].token_hash,
    createHash('sha256').update(cookie.value).digest('hex'),
    'only a hash of the secret session token is stored in the DB',
  );
  assert.equal((await h.readSession(cookie.value)).body.authenticated, true);
  const again = await h.verify(proof);
  assert.equal(again.status, 409, 'signed proof is one-time only');
  assert.equal(h.sessions.length, 1, 'replay must never issue another session');
  const logout = await h.revokeSession(cookie.value);
  assert.equal(logout.status, 200);
  assert.equal((await h.readSession(cookie.value)).body.authenticated, false);
  assert.equal(
    h.writes.some((x) => /reward|payout|referral|invitation/i.test(x.table)),
    false,
    'wallet proof must not touch any reward or payout table',
  );
});

test('wrong domain, key, nonce and network cannot mint a session', async () => {
  const h = harness();
  const fresh = (await h.issue()).body;
  const original = h.sign(fresh);
  const base = { walletAddress: WALLET.address, nonce: fresh.nonce, proofType: 'certificate' };

  assert.equal(
    (await h.verify({ ...base, certificate: h.sign(fresh, KEY, 'attacker.example') })).status,
    401,
  );
  assert.equal(
    (await h.verify({ ...base, certificate: h.sign(fresh, '0x' + '34'.repeat(32)) })).status,
    401,
  );
  assert.equal(
    (await h.verify({ ...base, nonce: 'bb'.repeat(32), certificate: original })).status,
    401,
  );
  h.setNetwork('mainnet');
  assert.equal(
    (await h.verify({ ...base, certificate: original })).status,
    401,
    'a testnet challenge cannot authorize the mainnet application',
  );
  h.setNetwork('testnet');
  assert.equal(h.sessions.length, 0);
  assert.equal(h.challenges[0].used_at, null, 'failures must not consume a valid proof');
  assert.equal((await h.verify({ ...base, certificate: original })).status, 201);
});

test('expired or tampered signed challenge fails closed before a database transaction', async () => {
  const expired = harness();
  const first = (await expired.issue()).body;
  expired.challenges[0].expires_at = new Date(Date.now() - 5_000).toISOString();
  assert.equal(
    (await expired.verify({
      walletAddress: WALLET.address, nonce: first.nonce,
      proofType: 'certificate', certificate: expired.sign(first),
    })).status,
    401,
  );
  assert.equal(expired.sessions.length, 0);

  const changed = harness();
  const second = (await changed.issue()).body;
  const signed = changed.sign(second);
  signed.payload = { ...signed.payload, content: signed.payload.content + ' tampered' };
  assert.equal(
    (await changed.verify({
      walletAddress: WALLET.address, nonce: second.nonce,
      proofType: 'certificate', certificate: signed,
    })).status,
    401,
  );
  assert.equal(changed.sessions.length, 0);
});
