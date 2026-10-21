import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const [config, packageJson] = await Promise.all([
  read('next.config.mjs'),
  read('package.json'),
]);

test('production webpack build uses low-risk memory optimization on standard Vercel builders', () => {
  assert.match(config, /experimental:\s*\{\s*webpackMemoryOptimizations: true,/);
  assert.equal(JSON.parse(packageJson).scripts.build, 'next build --webpack');
  // Memory savings must never be achieved by disabling type/build checks.
  assert.doesNotMatch(config, /ignoreBuildErrors:\s*true|ignoreDuringBuilds:\s*true/);
  // Keep Sentry wrapping intact when credentials are configured.
  assert.match(config, /withSentryConfig\(nextConfig,/);
});
