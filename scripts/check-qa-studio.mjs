import fs from 'node:fs';

const requiredFiles = [
  'src/app/qa/layout.tsx',
  'src/app/qa/page.tsx',
  'src/app/qa/render/page.tsx',
  'src/qa/access.ts',
  'src/qa/types.ts',
  'src/qa/scenarioRegistry.ts',
  'src/qa/featureCoverageMap.ts',
  'src/qa/QaStudio.tsx',
  'src/qa/QaScenarioRenderer.tsx',
  'src/lib/supabaseServer.ts',
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
  throw new Error('Dedicated QA Production access must retain an exact configured QA host guard.');
}
if (!/VEINVITE_QA_STUDIO[\s\S]*VERCEL_ENV === 'preview'/.test(access)) {
  throw new Error('Dedicated QA Preview deployments must be recognized by the API isolation guard.');
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
if (!proxy.includes("'/qa'") || !proxy.includes("'/qa/:path*'")) {
  throw new Error('QA routes must be covered by the request proxy guard.');
}
if (!proxy.includes('isDedicatedQaHost(host)')) {
  throw new Error('Dedicated QA project API traffic must be recognized by the proxy.');
}
if (!/pathname\.startsWith\('\/api\/'\)[\s\S]*isDedicatedQaHost\(host\)/.test(proxy)) {
  throw new Error('The dedicated QA deployment must fail closed on application API routes.');
}

const supabaseServer = fs.readFileSync('src/lib/supabaseServer.ts', 'utf8');
if (!supabaseServer.includes('isDedicatedQaPreview')) {
  throw new Error('Server Supabase setup must recognize the isolated dedicated QA Preview.');
}
if (!supabaseServer.includes('qa-studio-disabled-server-key')) {
  throw new Error('Dedicated QA Preview builds must not require a real server database secret.');
}
if (!supabaseServer.includes('Dedicated QA Studio server database access is disabled.')) {
  throw new Error('Dedicated QA Preview server database requests must fail closed.');
}
if (!supabaseServer.includes("'SUPABASE_SECRET_KEY is not configured.'")) {
  throw new Error('Normal deployments must continue to fail fast without SUPABASE_SECRET_KEY.');
}

const renderer = fs.readFileSync('src/qa/QaScenarioRenderer.tsx', 'utf8');
if (!renderer.includes("from '@/components/InviteLandingV2'")) {
  throw new Error('QA Studio must reuse the real InviteLandingV2 component.');
}
for (const preview of [
  'UiTestLab',
  'NotificationUiPreview',
  'InviteRejectionPreview',
  'InfiniteReferralCanvasPreview',
]) {
  if (!renderer.includes(preview)) {
    throw new Error(`QA Studio must retain direct ${preview} preview coverage.`);
  }
}
if (renderer.includes('fetch(') || renderer.includes('supabase')) {
  throw new Error('QA scenario renderer must not issue live network/database requests.');
}

const types = fs.readFileSync('src/qa/types.ts', 'utf8');
if (!types.includes('height: number')) {
  throw new Error('QA viewport contracts must include height as well as width.');
}
if (!types.includes("'demo-outcome'")) {
  throw new Error('QA action types must include the demo-outcome action emitted by the renderer.');
}
if (!types.includes('QaScenarioContext') || !types.includes('caseId: string')) {
  throw new Error('QA scenarios must retain human-readable case context metadata.');
}

const registry = fs.readFileSync('src/qa/scenarioRegistry.ts', 'utf8');
if (!registry.includes('export const QA_SCENARIOS')) {
  throw new Error('Central QA_SCENARIOS registry is required.');
}
if (!registry.includes('expected:')) {
  throw new Error('QA scenarios must define expected results.');
}
if (!registry.includes('mission-reward-preview') || !registry.includes('notification-preview')) {
  throw new Error('QA registry must retain the expanded mission/reward and notification coverage.');
}
for (const field of ['caseId:', 'actor:', 'trigger:', 'state:', 'outcome:']) {
  if (!registry.includes(field)) {
    throw new Error(`QA registry must describe each case with ${field}`);
  }
}
if (!registry.includes('duplicate case id')) {
  throw new Error('QA registry validation must reject duplicate human case IDs.');
}

const coverage = fs.readFileSync('src/qa/featureCoverageMap.ts', 'utf8');
if (!coverage.includes('QA_SURFACE_COVERAGE')) {
  throw new Error('QA feature coverage map is required for future changed-screen selection.');
}
if (!coverage.includes('watchedPaths') || !coverage.includes('scenarioIds')) {
  throw new Error('QA feature coverage map must link source paths to scenario ids.');
}

const studio = fs.readFileSync('src/qa/QaStudio.tsx', 'utf8');
if (!studio.includes('/qa/render?scenario=')) {
  throw new Error('QA Studio must render scenarios inside the isolated browser viewport route.');
}
if (!studio.includes('Production writes')) {
  throw new Error('QA Studio must visibly expose its no-Production-write invariant.');
}
if (!studio.includes('핵심 점검') || !studio.includes('모든 상황')) {
  throw new Error('QA Studio must retain clear core/all scenario browsing modes.');
}
if (!studio.includes('현재 경우의 수') || !studio.includes('어떤 때') || !studio.includes('이후 흐름')) {
  throw new Error('QA Studio must explain the selected case in operator language.');
}
if (!studio.includes('groupFilter') || !studio.includes('caseFilterChips')) {
  throw new Error('QA Studio must retain case grouping/filter UX.');
}
if (!studio.includes('item.context.actor') || !studio.includes('item.context.trigger')) {
  throw new Error('QA case search/listing must expose who and when context.');
}
if (!studio.includes('reviewKey(') || !studio.includes('viewportId') || !studio.includes('locale')) {
  throw new Error('QA operator reviews must be scoped to scenario + viewport + locale.');
}
if (!studio.includes("'blocked'") || !studio.includes('확인 불가')) {
  throw new Error('QA Studio must retain an explicit unable-to-verify result.');
}
if (!studio.includes('미확인으로 되돌리기')) {
  throw new Error('QA Studio must let operators clear an accidental review result.');
}
if (!studio.includes('navigator.clipboard') || !studio.includes('현재 설정 링크 복사')) {
  throw new Error('QA Studio must retain reproducible configuration links.');
}
if (!studio.includes('onLoad={() => setFrameState') || !studio.includes('다시 시도')) {
  throw new Error('QA Studio must expose preview loading/recovery state.');
}
if (!studio.includes('viewport.height')) {
  throw new Error('QA Studio must render the configured viewport height.');
}
if (!studio.includes('문제 종류') || !studio.includes('짧은 메모')) {
  throw new Error('QA issue results must retain lightweight category and note capture.');
}
if (!studio.includes('고급 정보 보기')) {
  throw new Error('QA Studio must keep technical inspection optional instead of default.');
}

const nextConfig = fs.readFileSync('next.config.mjs', 'utf8');
if (!nextConfig.includes("source: '/qa/:path*'")) {
  throw new Error('QA routes must retain no-cache/no-index response headers.');
}

console.log('QA Studio architecture gate passed.');