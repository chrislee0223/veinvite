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

if (!/setInterval\(\s*loadForecast,\s*15\s*\*\s*60_000\s*\)/s.test(forecastPortal)) {
  failures.push(
    'Public reward forecast polling must stay at the reviewed 15-minute cadence.',
  );
}

if (/setInterval\([^)]*,\s*60_000\s*\)/s.test(forecastPortal)) {
  failures.push(
    'Public reward forecast must not regress to one-minute client polling.',
  );
}

for (const legacyDetail of [
  'estimateRange',
  'estimateMeta',
  'formatUpdatedAt',
]) {
  if (forecastPortal.includes(legacyDetail)) {
    failures.push(
      `Public reward forecast UI must stay simplified; legacy detail returned: ${legacyDetail}.`,
    );
  }
}

if (!/text-align:center/.test(forecastPortal)) {
  failures.push(
    'Public reward forecast disclaimer must keep the reviewed centered mobile presentation.',
  );
}

if (!/data\.rewardForecastPreview|rewardForecastPreview/.test(forecastPortal)) {
  failures.push(
    'UI test reward forecast must keep its fake-data preview path instead of fetching production data.',
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
