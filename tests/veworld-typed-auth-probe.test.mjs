import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [page, component] = await Promise.all([
  readFile('src/app/ui-test/wallet-auth-v2/page.tsx', 'utf8'),
  readFile('src/components/VeWorldTypedAuthProbe.tsx', 'utf8'),
]);

test('VeWorld typed auth probe is preview-only and never uses certificates', () => {
  assert.match(page, /process\.env\.VERCEL_ENV === 'preview'/);
  assert.match(page, /notFound\(\)/);
  assert.match(component, /connectV2\(typedData\)/);
  assert.match(component, /requestTypedData\(/);
  assert.match(component, /thor_signTypedData/);
  assert.doesNotMatch(component, /requestCertificate|thor_signCertificate/);
});
