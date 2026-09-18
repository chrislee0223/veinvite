import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const nextConfig = fs.readFileSync(new URL('../next.config.mjs', import.meta.url), 'utf8');
const providers = fs.readFileSync(new URL('../src/components/AppProviders.tsx', import.meta.url), 'utf8');
const guard = fs.readFileSync(new URL('../src/components/RuntimeVersionGuard.tsx', import.meta.url), 'utf8');
const route = fs.readFileSync(new URL('../src/app/api/runtime-version/route.ts', import.meta.url), 'utf8');

test('embedded root document is not cacheable', () => {
  assert.match(nextConfig, /source: '\/'/);
  assert.match(nextConfig, /Cache-Control'[\s\S]*no-store, no-cache, must-revalidate, max-age=0/);
  assert.match(nextConfig, /Vercel-CDN-Cache-Control/);
  assert.match(nextConfig, /NEXT_PUBLIC_APP_RELEASE/);
});

test('runtime guard refreshes a stale embedded bundle using a release query', () => {
  assert.match(providers, /<RuntimeVersionGuard \/>/);
  assert.match(guard, /\/api\/runtime-version/);
  assert.match(guard, /__veinvite_release/);
  assert.match(guard, /window\.location\.replace/);
  assert.match(guard, /visibilitychange/);
  assert.match(guard, /pageshow/);
});

test('runtime version endpoint is force-dynamic and uncached', () => {
  assert.match(route, /dynamic = 'force-dynamic'/);
  assert.match(route, /VERCEL_GIT_COMMIT_SHA/);
  assert.match(route, /Cache-Control'[\s\S]*no-store/);
});
