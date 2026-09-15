import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const ADMIN_ROOT = path.join('src', 'app', 'api', 'admin');

// Exact, reviewed exceptions only. New routes never inherit an exception by
// naming convention; they must be reviewed and classified explicitly.
const PUBLIC_ADMIN_ROUTES = new Set([
  'src/app/api/admin/funding-config/route.ts',
]);

const SECRET_ADMIN_ROUTES = new Map([
  [
    'src/app/api/admin/reconcile/route.ts',
    'VEINVITE_RECONCILE_SECRET',
  ],
]);

const PREVIEW_SECRET_ADMIN_ROUTES = new Map([
  [
    'src/app/api/admin/rewards/dry-run/route.ts',
    'VEINVITE_REWARD_DRY_RUN_SECRET',
  ],
]);

const PREVIEW_SELF_TEST_ROUTES = new Set([
  'src/app/api/admin/rewards/emergency-pause-self-test/route.ts',
  'src/app/api/admin/rewards/manifest-self-test/route.ts',
  'src/app/api/admin/rewards/pool-self-test/route.ts',
  'src/app/api/admin/rewards/self-test/route.ts',
  'src/app/api/admin/rewards/tx-verification-self-test/route.ts',
  'src/app/api/admin/sybil/self-test/route.ts',
  'src/app/api/admin/sybil/vepassport-self-test/route.ts',
]);

const MUTATION_EXPORT = /export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)\s*\(/u;
const GET_EXPORT = /export\s+async\s+function\s+GET\s*\(/u;
const PRODUCTION_GATE = /process\.env\.VERCEL_ENV\s*===\s*['"]production['"]/u;

async function walkRoutes(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const routes = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      routes.push(...await walkRoutes(fullPath));
      continue;
    }

    if (entry.isFile() && entry.name === 'route.ts') {
      routes.push(fullPath.split(path.sep).join('/'));
    }
  }

  return routes;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function verifyPublicException(routePath, source) {
  assert(GET_EXPORT.test(source), `${routePath}: public exception must remain GET-only.`);
  assert(!MUTATION_EXPORT.test(source), `${routePath}: public exception must never expose a mutation method.`);
  assert(source.includes('enforceRateLimits'), `${routePath}: public exception must remain rate-limited.`);
  assert(source.includes('getClientIpSubject'), `${routePath}: public exception must retain an IP-scoped rate-limit subject.`);
  assert(!source.includes('supabaseAdmin'), `${routePath}: public exception must not gain service-role database access.`);
  assert(!source.includes('requireWalletSession'), `${routePath}: public exception changed authentication shape; review the classification.`);
}

function verifySecretRoute(routePath, source, secretName) {
  assert(MUTATION_EXPORT.test(source), `${routePath}: secret-protected operator route must remain an explicit mutation surface.`);
  assert(source.includes(`process.env.${secretName}`), `${routePath}: configured secret ${secretName} must remain authoritative.`);
  assert(source.includes("request.headers.get('x-veinvite-admin-secret')"), `${routePath}: operator secret must come from the reviewed admin header.`);
  assert(source.includes('timingSafeEqual'), `${routePath}: operator secret comparison must remain timing-safe.`);
  assert(/status:\s*401/u.test(source), `${routePath}: invalid secret must remain unauthorized.`);
}

function verifyPreviewSecretRoute(routePath, source, secretName) {
  verifySecretRoute(routePath, source, secretName);
  assert(PRODUCTION_GATE.test(source), `${routePath}: preview operator tool must remain disabled in Production.`);
  assert(/status:\s*403/u.test(source), `${routePath}: Production must fail closed before preview-only work.`);
}

function verifyPreviewSelfTest(routePath, source) {
  assert(GET_EXPORT.test(source), `${routePath}: self-test must remain GET-only.`);
  assert(!MUTATION_EXPORT.test(source), `${routePath}: self-test must never expose a mutation method.`);
  assert(PRODUCTION_GATE.test(source), `${routePath}: self-test must remain disabled in Production.`);
  assert(/status:\s*403/u.test(source), `${routePath}: Production self-test access must fail closed.`);
  assert(!source.includes('supabaseAdmin'), `${routePath}: self-test must not gain direct service-role database access.`);
}

function verifyWalletOperatorRoute(routePath, source) {
  assert(source.includes('requireWalletSession'), `${routePath}: admin route must verify a wallet session.`);
  assert(source.includes('readVeInviteRewardPoolStatus'), `${routePath}: admin route must read the authoritative VeInvite operator configuration.`);
  assert(source.includes('canOperateVeInviteRewards'), `${routePath}: admin route must verify the authenticated wallet is an authorized VeInvite operator.`);
}

const routes = (await walkRoutes(ADMIN_ROOT)).sort();
assert(routes.length > 0, 'No admin API routes were discovered; fail closed.');

const reviewedSpecialRoutes = new Set([
  ...PUBLIC_ADMIN_ROUTES,
  ...SECRET_ADMIN_ROUTES.keys(),
  ...PREVIEW_SECRET_ADMIN_ROUTES.keys(),
  ...PREVIEW_SELF_TEST_ROUTES,
]);

for (const reviewedPath of reviewedSpecialRoutes) {
  assert(routes.includes(reviewedPath), `Reviewed admin-route classification no longer exists: ${reviewedPath}`);
}

const failures = [];
const counts = {
  walletOperator: 0,
  secret: 0,
  previewSecret: 0,
  previewSelfTest: 0,
  publicReadOnly: 0,
};

for (const routePath of routes) {
  const source = await readFile(routePath, 'utf8');

  try {
    if (PUBLIC_ADMIN_ROUTES.has(routePath)) {
      verifyPublicException(routePath, source);
      counts.publicReadOnly += 1;
    } else if (SECRET_ADMIN_ROUTES.has(routePath)) {
      verifySecretRoute(routePath, source, SECRET_ADMIN_ROUTES.get(routePath));
      counts.secret += 1;
    } else if (PREVIEW_SECRET_ADMIN_ROUTES.has(routePath)) {
      verifyPreviewSecretRoute(routePath, source, PREVIEW_SECRET_ADMIN_ROUTES.get(routePath));
      counts.previewSecret += 1;
    } else if (PREVIEW_SELF_TEST_ROUTES.has(routePath)) {
      verifyPreviewSelfTest(routePath, source);
      counts.previewSelfTest += 1;
    } else {
      verifyWalletOperatorRoute(routePath, source);
      counts.walletOperator += 1;
    }
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }
}

if (failures.length > 0) {
  console.error('Admin API authentication gate failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Admin API authentication gate passed: ${routes.length} route(s) reviewed ` +
  `(${counts.walletOperator} wallet/operator, ${counts.secret} secret, ` +
  `${counts.previewSecret} preview+secret, ${counts.previewSelfTest} preview self-test, ` +
  `${counts.publicReadOnly} public read-only).`,
);
