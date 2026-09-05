import fs from 'node:fs';

const requiredFiles = [
  'src/app/qa/page.tsx',
  'src/app/qa/render/page.tsx',
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

for (const route of ['src/app/qa/page.tsx', 'src/app/qa/render/page.tsx']) {
  const source = fs.readFileSync(route, 'utf8');
  if (!source.includes("process.env.VERCEL_ENV === 'preview'")) {
    throw new Error(`${route} must explicitly allow Vercel Preview.`);
  }
  if (!source.includes('notFound()')) {
    throw new Error(`${route} must fail closed outside development/preview.`);
  }
}

const renderer = fs.readFileSync('src/qa/QaScenarioRenderer.tsx', 'utf8');
if (!renderer.includes("from '@/components/InviteLandingV2'")) {
  throw new Error('QA Studio must reuse the real InviteLandingV2 component.');
}
if (renderer.includes("fetch(") || renderer.includes('supabase')) {
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

console.log('QA Studio architecture gate passed.');
