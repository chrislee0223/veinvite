import assert from 'node:assert/strict';
import {
  readdirSync,
  readFileSync,
} from 'node:fs';
import {
  join,
  relative,
} from 'node:path';
import { test } from 'node:test';

const root = process.cwd();

function read(path) {
  return readFileSync(join(root, path), 'utf8');
}

function filesBelow(path) {
  const absolute = join(root, path);
  const files = [];

  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const child = join(absolute, entry.name);

    if (entry.isDirectory()) {
      files.push(...filesBelow(relative(root, child)));
      continue;
    }

    if (entry.isFile()) {
      files.push(relative(root, child));
    }
  }

  return files;
}

const SERVER_ONLY_MODULES = [
  'src/lib/supabaseServer.ts',
  'src/lib/rewards/automaticRewardPayout.ts',
  'src/lib/rewards/automaticRewardPayoutWithMnemonic.ts',
];

const PRODUCTION_ENV_PATTERN =
  /process\.env\.VERCEL_ENV\s*===\s*['"]production['"]/;
const PRODUCTION_GUARD_PATTERN =
  /if\s*\(\s*(?:isProductionDeployment\(\)|process\.env\.VERCEL_ENV\s*===\s*['"]production['"])\s*\)/;
const HANDLER_PATTERN =
  /export\s+async\s+function\s+(?:GET|POST|PUT|PATCH|DELETE)\s*\(/;

test('secret-bearing server modules remain impossible to import into client bundles', () => {
  for (const path of SERVER_ONLY_MODULES) {
    const source = read(path).trimStart();

    assert.match(
      source,
      /^import ['"]server-only['"];?/,
      `${path} must begin with an explicit server-only boundary`,
    );
  }
});

test('every admin self-test route fails closed before doing work in Production', () => {
  const selfTestRoutes = filesBelow('src/app/api/admin')
    .filter((path) => path.endsWith('self-test/route.ts'));

  assert.ok(
    selfTestRoutes.length >= 5,
    'expected the reviewed admin self-test route family to be present',
  );

  for (const path of selfTestRoutes) {
    const source = read(path);

    assert.match(
      source,
      PRODUCTION_ENV_PATTERN,
      `${path} must explicitly recognize the Vercel Production environment`,
    );

    const handlerMatch = HANDLER_PATTERN.exec(source);
    assert.ok(
      handlerMatch,
      `${path} must expose an explicit route handler`,
    );

    const handlerSource = source.slice(handlerMatch.index);
    const guardMatch = PRODUCTION_GUARD_PATTERN.exec(handlerSource);
    assert.ok(
      guardMatch,
      `${path} must check the Production guard inside its route handler`,
    );

    const firstAwait = handlerSource.indexOf('await ');
    assert.ok(
      firstAwait < 0 || guardMatch.index < firstAwait,
      `${path} must reject Production before its first awaited operation`,
    );

    assert.match(
      handlerSource,
      /status:\s*(?:403|404)/,
      `${path} must return a non-success status when blocked in Production`,
    );
  }
});
