import {
  existsSync,
  readFileSync,
} from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const failures = [];
const legacyPortal = join(
  root,
  'src/components/PublicRewardEstimatePortal.tsx',
);

if (existsSync(legacyPortal)) {
  failures.push(
    'Retired PublicRewardEstimatePortal must stay removed; it contained one-minute polling against the public reward estimate endpoint.',
  );
}

const forecastPortal = readFileSync(
  join(root, 'src/components/PublicRewardForecastPortal.tsx'),
  'utf8',
);

if (!/setInterval\(loadForecast,\s*15\s*\*\s*60_000\)/.test(forecastPortal)) {
  failures.push(
    'Public reward forecast polling must stay at the reviewed 15-minute cadence.',
  );
}

if (/setInterval\([^)]*,\s*60_000\s*\)/.test(forecastPortal)) {
  failures.push(
    'Public reward forecast must not regress to one-minute client polling.',
  );
}

const forecastRoute = readFileSync(
  join(root, 'src/app/api/rewards/estimate/route.ts'),
  'utf8',
);

if (!/s-maxage=300/.test(forecastRoute)) {
  failures.push(
    'Public reward forecast endpoint must keep a CDN cache window.',
  );
}

if (!/stale-while-revalidate=3600/.test(forecastRoute)) {
  failures.push(
    'Public reward forecast endpoint must retain stale-while-revalidate protection.',
  );
}

if (failures.length > 0) {
  console.error('Forecast stability gate failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Forecast stability gate passed.');
