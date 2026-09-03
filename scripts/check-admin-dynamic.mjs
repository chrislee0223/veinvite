import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(
  join(process.cwd(), 'src/app/admin/layout.tsx'),
  'utf8',
);

if (!/export const dynamic\s*=\s*['\"]force-dynamic['\"]/.test(source)) {
  console.error(
    'Admin rendering gate failed: /admin must remain explicitly force-dynamic because authorization depends on request cookies and live operator membership.',
  );
  process.exit(1);
}

if (!/cookies\(\)/.test(source) || !/notFound\(\)/.test(source)) {
  console.error(
    'Admin rendering gate failed: the shared admin layout no longer contains the reviewed cookie/session denial path.',
  );
  process.exit(1);
}

console.log('Admin dynamic rendering gate passed.');
