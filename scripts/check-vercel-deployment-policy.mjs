import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  PRODUCTION_PROJECT_ID,
  QA_PROJECT_ID,
  shouldBuildVercelProject,
} from './vercel-ignore-build.mjs';

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
const infiniteCanvasPreview = readFileSync(
  join(process.cwd(), 'src/app/ui-test/infinite-canvas/page.tsx'),
  'utf8',
);

const deploymentEnabled = config?.git?.deploymentEnabled;
const failures = [];

if (!deploymentEnabled || typeof deploymentEnabled !== 'object') {
  failures.push('Vercel git.deploymentEnabled must be configured.');
} else {
  if (deploymentEnabled['**'] !== false) {
    failures.push(
      'All branches must fail closed by default with the ** deployment glob.',
    );
  }
  if (deploymentEnabled.main !== true) {
    failures.push('The main branch must remain eligible for Production deployment.');
  }
  if (deploymentEnabled['qa-*'] !== true) {
    failures.push('Only designated qa-* branches may be eligible for QA deployment.');
  }

  const unexpectedDeploymentExceptions = Object.keys(
    deploymentEnabled,
  ).filter((key) => !['**', 'main', 'qa-*'].includes(key));

  if (unexpectedDeploymentExceptions.length > 0) {
    failures.push(
      `Only main and qa-* may bypass the default deployment block. Remove stale branch exceptions: ${unexpectedDeploymentExceptions.join(', ')}.`,
    );
  }
}

if (config?.ignoreCommand !== 'node scripts/vercel-ignore-build.mjs') {
  failures.push(
    'Vercel must route builds through the project-aware ignored-build guard.',
  );
}

const routingCases = [
  [
    shouldBuildVercelProject(PRODUCTION_PROJECT_ID, 'main'),
    true,
    'Production project must build main.',
  ],
  [
    shouldBuildVercelProject(PRODUCTION_PROJECT_ID, 'qa-network-smoke'),
    false,
    'Production project must ignore QA branches.',
  ],
  [
    shouldBuildVercelProject(PRODUCTION_PROJECT_ID, 'fix/example'),
    false,
    'Production project must ignore ordinary non-main branches.',
  ],
  [
    shouldBuildVercelProject(QA_PROJECT_ID, 'main'),
    false,
    'QA project must not duplicate main builds.',
  ],
  [
    shouldBuildVercelProject(QA_PROJECT_ID, 'qa-network-smoke'),
    true,
    'QA project must build designated qa-* branches.',
  ],
  [
    shouldBuildVercelProject(QA_PROJECT_ID, 'feat/example'),
    false,
    'QA project must ignore non-designated feature branches.',
  ],
  [
    shouldBuildVercelProject('prj_unknown', 'main'),
    false,
    'Unknown Vercel projects must fail closed.',
  ],
];

for (const [actual, expected, message] of routingCases) {
  if (actual !== expected) failures.push(message);
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

if (!/poweredByHeader\s*:\s*false/.test(nextConfig)) {
  failures.push(
    'Public responses must not expose the default Next.js X-Powered-By header.',
  );
}

if (
  /초대 슬롯 1개/.test(infiniteCanvasPreview) ||
  !/재사용 가능한 친구 슬롯 2개/.test(infiniteCanvasPreview)
) {
  failures.push(
    'Infinite Canvas preview must describe the current two reusable friend-slot policy and never revive the retired one-slot copy.',
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
