import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const config = JSON.parse(
  readFileSync(join(process.cwd(), 'vercel.json'), 'utf8'),
);
const nextConfig = readFileSync(
  join(process.cwd(), 'next.config.mjs'),
  'utf8',
);
const cronRoute = readFileSync(
  join(process.cwd(), 'src/app/api/cron/reconcile/route.ts'),
  'utf8',
);
const demoCompletionRoute = readFileSync(
  join(
    process.cwd(),
    'src/app/api/invites/[code]/complete/route.ts',
  ),
  'utf8',
);

const deploymentEnabled = config?.git?.deploymentEnabled;
const failures = [];

if (!deploymentEnabled || typeof deploymentEnabled !== 'object') {
  failures.push('Vercel git.deploymentEnabled must be configured.');
} else {
  if (deploymentEnabled['**'] !== false) {
    failures.push(
      'All non-main branches, including slash-named branches such as fix/foo, must be disabled with the ** glob.',
    );
  }
  if (deploymentEnabled.main !== true) {
    failures.push('The main branch must remain enabled for production deployment.');
  }
  if (deploymentEnabled['*'] === false) {
    failures.push(
      'Do not rely on * to disable every branch: minimatch * does not cover slash-named branches such as fix/foo.',
    );
  }
}

const crons = config?.crons;
if (!Array.isArray(crons)) {
  failures.push('Vercel crons must remain configured.');
} else {
  const reconciliationCron = crons.find(
    (cron) => cron?.path === '/api/cron/reconcile',
  );

  if (!reconciliationCron) {
    failures.push(
      'The production reconciliation/housekeeping cron must remain configured.',
    );
  } else if (reconciliationCron.schedule !== '17 0 * * *') {
    failures.push(
      'The reviewed daily reconciliation cron schedule must remain 17 0 * * * unless the runtime policy is deliberately changed.',
    );
  }
}

if (!/process\.env\.CRON_SECRET/.test(cronRoute)) {
  failures.push('The reconciliation cron must remain protected by CRON_SECRET.');
}
if (!/timingSafeEqual/.test(cronRoute)) {
  failures.push(
    'The reconciliation cron must keep timing-safe bearer-secret comparison.',
  );
}
if (!/cleanupEphemeralSecurityState/.test(cronRoute)) {
  failures.push(
    'The reconciliation cron must continue running ephemeral security-state housekeeping.',
  );
}

if (
  !/NEXT_PUBLIC_DEMO_MODE/.test(nextConfig) ||
  !/process\.env\.VERCEL_ENV\s*===\s*'production'[\s\S]*\?\s*'false'/.test(
    nextConfig,
  )
) {
  failures.push(
    'Production bundles must force NEXT_PUBLIC_DEMO_MODE=false even if a stale project variable is enabled.',
  );
}

if (
  !/VEINVITE_ALLOW_DEMO_COMPLETION/.test(demoCompletionRoute) ||
  !/process\.env\.VERCEL_ENV\s*===\s*'preview'/.test(
    demoCompletionRoute,
  ) ||
  !/isLocalDevelopment/.test(demoCompletionRoute) ||
  !/if \(!isDemoCompletionEnabled\(\)\)/.test(
    demoCompletionRoute,
  )
) {
  failures.push(
    'Demo mission completion must remain independently blocked outside Preview/local development.',
  );
}

if (failures.length > 0) {
  console.error('Vercel deployment policy gate failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Vercel deployment policy gate passed.');