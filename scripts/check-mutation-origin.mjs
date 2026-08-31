import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), 'utf8');
const failures = [];

const proxy = read('src/proxy.ts');

if (!/SAFE_METHODS/.test(proxy) || !/'GET'/.test(proxy) || !/'HEAD'/.test(proxy) || !/'OPTIONS'/.test(proxy)) {
  failures.push('API mutation guard must leave safe HTTP methods unchanged.');
}

if (!/pathname\.startsWith\('\/api\/'\)/.test(proxy)) {
  failures.push('API mutation guard must be scoped to /api routes.');
}

if (!/request\.headers\.get\('origin'\)/.test(proxy) || !/new URL\(origin\)\.origin !== request\.nextUrl\.origin/.test(proxy)) {
  failures.push('API mutation guard must reject an explicit foreign Origin.');
}

if (!/sec-fetch-site/.test(proxy) || !/fetchSite === 'cross-site'/.test(proxy) || !/fetchSite === 'same-site'/.test(proxy)) {
  failures.push('API mutation guard must use Fetch Metadata as browser CSRF defense-in-depth.');
}

if (!/status:\s*403/.test(proxy) || !/Cross-site mutation requests are not allowed/.test(proxy)) {
  failures.push('Cross-site mutation attempts must fail closed with HTTP 403.');
}

if (!/matcher:\s*\[[^\]]*'\/ui-test'[^\]]*'\/api\/:path\*'[^\]]*\]/s.test(proxy)) {
  failures.push('Proxy matcher must cover both the production UI-test block and API requests.');
}

const verifyRoute = read('src/app/api/auth/verify/route.ts');
if (!/sameSite:\s*'lax'/.test(verifyRoute) || !/httpOnly:\s*true/.test(verifyRoute)) {
  failures.push('Wallet session cookie must retain HttpOnly + SameSite=Lax browser protections.');
}

const cronRoute = read('src/app/api/cron/reconcile/route.ts');
if (!/timingSafeEqual/.test(cronRoute) || !/process\.env\.CRON_SECRET/.test(cronRoute) || !/Bearer \$\{secret\}/.test(cronRoute)) {
  failures.push('Server-to-server cron recovery must retain its independent constant-time Bearer secret authentication.');
}

if (failures.length > 0) {
  console.error('API mutation origin gate failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('API mutation origin gate passed.');
