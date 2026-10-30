import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const guard = join(root, 'scripts/check-retired-production-routes.mjs');
const retiredRoutes = [
  'src/app/api/internal/first-reward-recovery/route.ts',
  'src/app/api/internal/claimed-reward-recovery/route.ts',
  'src/app/api/internal/recover-round16-finality/route.ts',
  'src/app/api/internal/round13-chain-status/route.ts',
];

function inTemporaryProject(run) {
  const cwd = mkdtempSync(join(tmpdir(), 'veinvite-retired-route-'));
  try {
    return run(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

function check(cwd) {
  return spawnSync(process.execPath, [guard], { cwd, encoding: 'utf8' });
}

test('retired-route guard passes when retired routes are absent', () => {
  inTemporaryProject((cwd) => {
    const result = check(cwd);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /guard passed/);
  });
});

for (const route of retiredRoutes) {
  test(`retired-route guard rejects reintroduced ${route}`, () => {
    inTemporaryProject((cwd) => {
      const path = join(cwd, route);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, 'export async function GET() {}\n');
      const result = check(cwd);
      assert.equal(result.status, 1, result.stdout);
      assert.match(result.stderr, /must not be restored/);
      assert.ok(result.stderr.includes(route));
    });
  });
}
