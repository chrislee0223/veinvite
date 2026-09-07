import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const ADMIN_ROOT = path.join('src', 'app', 'api', 'admin');

// This endpoint intentionally exposes only public VeBetterDAO on-chain app
// configuration. Keep the exception exact and fail closed if its shape drifts.
const PUBLIC_ADMIN_ROUTES = new Map([
  [
    'src/app/api/admin/funding-config/route.ts',
    'public read-only VeBetterDAO funding configuration',
  ],
]);

const MUTATION_EXPORT = /export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)\s*\(/u;

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
  if (!condition) {
    throw new Error(message);
  }
}

function verifyPublicException(routePath, source) {
  assert(
    /export\s+async\s+function\s+GET\s*\(/u.test(source),
    `${routePath}: public exception must remain GET-only.`,
  );
  assert(
    !MUTATION_EXPORT.test(source),
    `${routePath}: public exception must never expose a mutation method.`,
  );
  assert(
    source.includes('enforceRateLimits'),
    `${routePath}: public exception must remain rate-limited.`,
  );
  assert(
    source.includes('getClientIpSubject'),
    `${routePath}: public exception must retain an IP-scoped rate-limit subject.`,
  );
  assert(
    !source.includes('supabaseAdmin'),
    `${routePath}: public exception must not gain service-role database access.`,
  );
  assert(
    !source.includes('requireWalletSession'),
    `${routePath}: public exception changed authentication shape; review the allowlist instead of silently drifting.`,
  );
}

function verifyProtectedRoute(routePath, source) {
  assert(
    source.includes('requireWalletSession'),
    `${routePath}: admin route must verify a wallet session.`,
  );
  assert(
    source.includes('readVeInviteRewardPoolStatus'),
    `${routePath}: admin route must read the authoritative VeInvite reward-pool operator configuration.`,
  );
  assert(
    source.includes('canOperateVeInviteRewards'),
    `${routePath}: admin route must verify that the authenticated wallet is an authorized VeInvite operator.`,
  );

  const sessionCall = source.indexOf('requireWalletSession');
  const operatorCheck = source.indexOf('canOperateVeInviteRewards');
  assert(
    sessionCall >= 0 && operatorCheck >= 0,
    `${routePath}: admin authentication markers are incomplete.`,
  );
}

const routes = (await walkRoutes(ADMIN_ROOT)).sort();

assert(routes.length > 0, 'No admin API routes were discovered; fail closed.');

for (const allowlistedPath of PUBLIC_ADMIN_ROUTES.keys()) {
  assert(
    routes.includes(allowlistedPath),
    `Public admin-route allowlist entry no longer exists: ${allowlistedPath}`,
  );
}

const failures = [];
let protectedCount = 0;
let publicCount = 0;

for (const routePath of routes) {
  const source = await readFile(routePath, 'utf8');

  try {
    if (PUBLIC_ADMIN_ROUTES.has(routePath)) {
      verifyPublicException(routePath, source);
      publicCount += 1;
    } else {
      verifyProtectedRoute(routePath, source);
      protectedCount += 1;
    }
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }
}

if (failures.length > 0) {
  console.error('Admin API authentication gate failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(
  `Admin API authentication gate passed: ${protectedCount} protected route(s), ${publicCount} reviewed public exception(s).`,
);
