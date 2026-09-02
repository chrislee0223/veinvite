import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const migrationPath =
  'supabase/migrations/20260903033000_qualify_referral_network_edges.sql';
const migration = await readFile(
  new URL(`../${migrationPath}`, import.meta.url),
  'utf8',
);

async function findSelfTestRoutes(directory) {
  const entries = await readdir(directory, {
    withFileTypes: true,
  });
  const routes = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      routes.push(...await findSelfTestRoutes(path));
      continue;
    }

    if (
      entry.isFile() &&
      entry.name === 'route.ts' &&
      path.includes('self-test')
    ) {
      routes.push(path);
    }
  }

  return routes;
}

test('qualified referral projection is fail-closed without mutating raw history', () => {
  assert.match(
    migration,
    /create or replace view public\.qualified_referral_relationships/i,
  );
  assert.match(
    migration,
    /i\.ineligibility_check_id is null/i,
  );
  assert.match(
    migration,
    /coalesce\(e\.outcome, legacy\.outcome\) = 'ELIGIBLE'/i,
  );
  assert.match(
    migration,
    /in \('NEW', 'RETURNING'\)/i,
  );
  assert.match(
    migration,
    /i\.invite_code = r\.source_invite_code/i,
  );
  assert.match(
    migration,
    /i\.invitee_wallet is not null/i,
  );

  assert.doesNotMatch(
    migration,
    /delete\s+from\s+public\.referral_relationships/i,
  );
  assert.doesNotMatch(
    migration,
    /update\s+public\.referral_relationships/i,
  );
  assert.doesNotMatch(
    migration,
    /truncate\s+(?:table\s+)?public\.referral_relationships/i,
  );

  assert.match(
    migration,
    /revoke all on table public\.qualified_referral_relationships\s+from public, anon, authenticated, service_role/i,
  );
  assert.match(
    migration,
    /grant select on table public\.qualified_referral_relationships\s+to service_role/i,
  );
});

test('legacy operator referral completion uses the current mission definition', () => {
  const start = migration.indexOf(
    'create or replace view public.operator_referral_leaderboard',
  );
  assert.ok(start >= 0);
  const view = migration.slice(start);

  assert.match(view, /i\.status = 'COMPLETED'/i);
  assert.match(view, /i\.ineligibility_check_id is null/i);
  assert.match(view, /coalesce\(e\.outcome, legacy\.outcome\) = 'ELIGIBLE'/i);
  assert.match(view, /coalesce\(e\.entry_class, legacy\.entry_class\) in \('NEW', 'RETURNING'\)/i);
  assert.match(view, /i\.apps_completed >= 3/i);
  assert.match(view, /i\.vot3_converted is true/i);
  assert.match(view, /i\.vote_completed is true/i);
  assert.match(view, /i\.sybil_status = 'CLEAR'/i);
});

test('every admin self-test route fails closed before Production work begins', async () => {
  const adminApi = new URL(
    '../src/app/api/admin',
    import.meta.url,
  );
  const routes = await findSelfTestRoutes(adminApi);

  assert.ok(
    routes.length >= 7,
    `expected at least 7 self-test routes, found ${routes.length}`,
  );

  for (const path of routes) {
    const source = await readFile(path, 'utf8');
    const displayPath = relative(
      new URL(root).pathname,
      path,
    );
    const functionIndex = source.search(
      /export\s+async\s+function\s+(?:GET|POST|PUT|PATCH|DELETE)/,
    );
    assert.ok(
      functionIndex >= 0,
      `${displayPath} must expose an explicit route handler`,
    );

    const body = source.slice(functionIndex);
    const productionGuard = body.search(
      /if\s*\(\s*(?:isProductionDeployment\(\)|process\.env\.VERCEL_ENV\s*===\s*'production')\s*\)/,
    );
    assert.ok(
      productionGuard >= 0,
      `${displayPath} must fail closed in Production`,
    );

    const firstAwait = body.indexOf('await ');
    if (firstAwait >= 0) {
      assert.ok(
        productionGuard < firstAwait,
        `${displayPath} must block Production before async DB/RPC/on-chain work`,
      );
    }

    assert.match(
      body.slice(productionGuard, productionGuard + 700),
      /status:\s*403/,
      `${displayPath} Production guard must return 403`,
    );
  }
});
