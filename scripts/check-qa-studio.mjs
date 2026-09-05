import fs from 'node:fs';

const requiredFiles = [
  'src/app/qa/layout.tsx',
  'src/app/qa/page.tsx',
  'src/app/qa/render/page.tsx',
  'src/qa/access.ts',
  'src/qa/types.ts',
  'src/qa/scenarioRegistry.ts',
  'src/qa/QaStudio.tsx',
  'src/qa/QaScenarioRenderer.tsx',
];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) {
    throw new Error(`QA Studio required file is missing: ${file}`);
  }
}

const access = fs.readFileSync('src/qa/access.ts', 'utf8');
if (!access.includes("process.env.VERCEL_ENV === 'preview'")) {
  throw new Error('QA access must continue to allow isolated Vercel Preview deployments.');
}
if (!access.includes("process.env.VEINVITE_QA_STUDIO !== 'true'")) {
  throw new Error('Dedicated QA access must require an explicit VEINVITE_QA_STUDIO=true flag.');
}
if (!access.includes('process.env.VEINVITE_QA_HOST')) {
  throw new Error('Dedicated QA access must require an exact configured QA host.');
}

const qaLayout = fs.readFileSync('src/app/qa/layout.tsx', 'utf8');
if (!qaLayout.includes('isQaStudioAccessAllowed')) {
  throw new Error('The QA route tree must use the shared fail-closed access guard.');
}
if (!qaLayout.includes('notFound()')) {
  throw new Error('Unauthorized QA route requests must fail closed with 404.');
}
if (!qaLayout.includes('x-forwarded-host')) {
  throw new Error('QA host validation must use the forwarded request host in Vercel.');
}

const proxy = fs.readFileSync('src/proxy.ts', 'utf8');
if (!proxy.includes("'/qa'" ) || !proxy.includes("'/qa/:path*'")) {
  throw new Error('QA routes must be covered by the request proxy guard.');
}
if (!proxy.includes('isDedicatedQaHost(host)')) {
  throw new Error('Dedicated QA project API traffic must be recognized by the proxy.');
}
if (!/pathname\.startsWith\('\/api\/'\)[\s\S]*isDedicatedQaHost\(host\)/.test(proxy)) {
  throw new Error('The dedicated QA host must fail closed on application API routes.');
}

const renderer = fs.readFileSync('src/qa/QaScenarioRenderer.tsx', 'utf8');
if (!renderer.includes("from '@/components/InviteLandingV2'")) {
  throw new Error('QA Studio must reuse the real InviteLandingV2 component.');
}
if (renderer.includes('fetch(') || renderer.includes('supabase')) {
  throw new Error('QA scenario renderer must not issue live network/database requests.');
}

const registry = fs.readFileSync('src/qa/scenarioRegistry.ts', 'utf8');
if (!registry.includes('export const QA_SCENARIOS')) {
  throw new Error('Central QA_SCENARIOS registry is required.');
}
if (!registry.includes('expected:')) {
  throw new Error('QA scenarios must define expected results.');
}

const studio = fs.readFileSync('src/qa/QaStudio.tsx', 'utf8');
if (!studio.includes('/qa/render?scenario=')) {
  throw new Error('QA Studio must render scenarios inside the isolated browser viewport route.');
}
if (!studio.includes('Production writes')) {
  throw new Error('QA Studio must visibly expose its no-Production-write invariant.');
}

const nextConfig = fs.readFileSync('next.config.mjs', 'utf8');
if (!nextConfig.includes("source: '/qa/:path*'")) {
  throw new Error('QA routes must retain no-cache/no-index response headers.');
}

console.log('QA Studio architecture gate passed.');
