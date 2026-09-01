import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const config = JSON.parse(
  readFileSync(join(process.cwd(), 'vercel.json'), 'utf8'),
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

if (failures.length > 0) {
  console.error('Vercel deployment policy gate failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Vercel deployment policy gate passed.');