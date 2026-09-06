import fs from 'node:fs';

const requiredFiles = [
  'src/app/qa/layout.tsx',
  'src/app/qa/page.tsx',
  'src/app/qa/render/page.tsx',
  'src/qa/access.ts',
  'src/qa/types.ts',
  'src/qa/scenarioRegistry.ts',
  'src/qa/stateRegistry.ts',
  'src/qa/featureCoverageMap.ts',
  'src/qa/QaStudio.tsx',
  'src/qa/QaStateInventoryPanel.tsx',
  'src/qa/QaScenarioRenderer.tsx',
  'src/lib/supabaseServer.ts',
];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) throw new Error(`QA Studio required file is missing: ${file}`);
}

const access = fs.readFileSync('src/qa/access.ts', 'utf8');
if (!access.includes("process.env.VERCEL_ENV === 'preview'")) throw new Error('QA access must continue to allow isolated Vercel Preview deployments.');
if (!access.includes("process.env.VEINVITE_QA_STUDIO !== 'true'")) throw new Error('Dedicated QA access must require an explicit VEINVITE_QA_STUDIO=true flag.');
if (!access.includes('process.env.VEINVITE_QA_HOST')) throw new Error('Dedicated QA Production access must retain an exact configured QA host guard.');
if (!/VEINVITE_QA_STUDIO[\s\S]*VERCEL_ENV === 'preview'/.test(access)) throw new Error('Dedicated QA Preview deployments must be recognized by the API isolation guard.');

const qaLayout = fs.readFileSync('src/app/qa/layout.tsx', 'utf8');
if (!qaLayout.includes('isQaStudioAccessAllowed')) throw new Error('The QA route tree must use the shared fail-closed access guard.');
if (!qaLayout.includes('notFound()')) throw new Error('Unauthorized QA route requests must fail closed with 404.');
if (!qaLayout.includes('x-forwarded-host')) throw new Error('QA host validation must use the forwarded request host in Vercel.');

const proxy = fs.readFileSync('src/proxy.ts', 'utf8');
if (!proxy.includes("'/qa'") || !proxy.includes("'/qa/:path*'")) throw new Error('QA routes must be covered by the request proxy guard.');
if (!proxy.includes('isDedicatedQaHost(host)')) throw new Error('Dedicated QA project API traffic must be recognized by the proxy.');
if (!/pathname\.startsWith\('\/api\/'\)[\s\S]*isDedicatedQaHost\(host\)/.test(proxy)) throw new Error('The dedicated QA deployment must fail closed on application API routes.');

const supabaseServer = fs.readFileSync('src/lib/supabaseServer.ts', 'utf8');
if (!supabaseServer.includes('isDedicatedQaPreview')) throw new Error('Server Supabase setup must recognize the isolated dedicated QA Preview.');
if (!supabaseServer.includes('qa-studio-disabled-server-key')) throw new Error('Dedicated QA Preview builds must not require a real server database secret.');
if (!supabaseServer.includes('Dedicated QA Studio server database access is disabled.')) throw new Error('Dedicated QA Preview server database requests must fail closed.');
if (!supabaseServer.includes("'SUPABASE_SECRET_KEY is not configured.'")) throw new Error('Normal deployments must continue to fail fast without SUPABASE_SECRET_KEY.');

const renderer = fs.readFileSync('src/qa/QaScenarioRenderer.tsx', 'utf8');
if (!renderer.includes("from '@/components/InviteLandingV2'")) throw new Error('QA Studio must reuse the real InviteLandingV2 component.');
for (const preview of ['UiTestLab', 'NotificationUiPreview', 'InviteRejectionPreview', 'InfiniteReferralCanvasPreview']) {
  if (!renderer.includes(preview)) throw new Error(`QA Studio must retain direct ${preview} preview coverage.`);
}
if (renderer.includes('fetch(') || renderer.includes('supabase')) throw new Error('QA scenario renderer must not issue live network/database requests.');

const types = fs.readFileSync('src/qa/types.ts', 'utf8');
if (!types.includes('height: number')) throw new Error('QA viewport contracts must include height as well as width.');
if (!types.includes("'demo-outcome'")) throw new Error('QA action types must include the demo-outcome action emitted by the renderer.');
if (!types.includes('QaScenarioContext') || !types.includes('caseId: string')) throw new Error('QA scenarios must retain human-readable case context metadata.');
if (!types.includes('QaScenarioGuide') || !types.includes('guide: QaScenarioGuide')) throw new Error('QA scenarios must retain guided operator task metadata.');

const registry = fs.readFileSync('src/qa/scenarioRegistry.ts', 'utf8');
if (!registry.includes('export const QA_SCENARIOS')) throw new Error('Central QA_SCENARIOS registry is required.');
if (!registry.includes('expected:')) throw new Error('QA scenarios must define expected results.');
if (!registry.includes('mission-reward-preview') || !registry.includes('notification-preview')) throw new Error('QA registry must retain the expanded mission/reward and notification coverage.');
for (const field of ['caseId:', 'actor:', 'trigger:', 'state:', 'outcome:', 'guide:', 'task:', 'done:']) {
  if (!registry.includes(field)) throw new Error(`QA registry must describe each case with ${field}`);
}
if (!registry.includes('duplicate case id')) throw new Error('QA registry validation must reject duplicate human case IDs.');
if (!registry.includes('missing guided task') || !registry.includes('missing guided success cue')) throw new Error('QA registry validation must reject incomplete guided instructions.');

const stateRegistry = fs.readFileSync('src/qa/stateRegistry.ts', 'utf8');
if (!stateRegistry.includes('QA_KNOWN_STATES')) throw new Error('Known Production UI states must have one central inventory.');
if (!stateRegistry.includes("QaStateLifecycle = 'production' | 'legacy' | 'future' | 'external'")) throw new Error('QA state inventory must distinguish current, legacy, future, and external UI.');
if (!stateRegistry.includes("QaStateCoverage = 'direct' | 'partial' | 'missing' | 'external'")) throw new Error('QA state inventory must distinguish direct, partial, missing, and external coverage.');
if (!stateRegistry.includes('validateQaKnownStateRegistry')) throw new Error('QA state inventory must retain structural validation.');
if (!stateRegistry.includes('getQaStateCoverageSummary')) throw new Error('QA state inventory must expose truthful coverage counts.');

const scenarioIds = new Set(
  [...registry.matchAll(/\n\s+id: '([^']+)',\n\s+caseId:/g)].map((match) => match[1]),
);
const stateBlocks = [...stateRegistry.matchAll(/knownState\(\{([\s\S]*?)\}\),/g)].map((match) => match[1]);
if (stateBlocks.length < 50) throw new Error('Known-state inventory unexpectedly lost broad Production coverage.');
const seenStateIds = new Set();
for (const block of stateBlocks) {
  const id = block.match(/\bid: '([^']+)'/)?.[1];
  const lifecycle = block.match(/\blifecycle: '([^']+)'/)?.[1];
  const coverageLevel = block.match(/\bcoverage: '([^']+)'/)?.[1];
  const scenariosText = block.match(/\bscenarioIds: \[([^\]]*)\]/)?.[1] ?? '';
  const referencedScenarios = [...scenariosText.matchAll(/'([^']+)'/g)].map((match) => match[1]);

  if (!id) throw new Error('QA known-state entry is missing an id.');
  if (seenStateIds.has(id)) throw new Error(`duplicate QA state id: ${id}`);
  seenStateIds.add(id);
  if (!block.includes('sourcePaths: [')) throw new Error(`QA state ${id} is missing source paths.`);
  if ((coverageLevel === 'direct' || coverageLevel === 'partial') && referencedScenarios.length < 1) {
    throw new Error(`Covered QA state ${id} must reference at least one scenario.`);
  }
  if (coverageLevel === 'external' && lifecycle !== 'external') {
    throw new Error(`External QA coverage must use external lifecycle: ${id}`);
  }
  for (const scenarioId of referencedScenarios) {
    if (!scenarioIds.has(scenarioId)) throw new Error(`QA state ${id} references unknown scenario ${scenarioId}.`);
  }
}

const statePanel = fs.readFileSync('src/qa/QaStateInventoryPanel.tsx', 'utf8');
if (!statePanel.includes('실제 앱 상태 전수 목록')) throw new Error('QA Studio must expose the known-state inventory to the operator.');
if (!statePanel.includes('현재 실제 앱에서 볼 수 있는 상황')) throw new Error('Current Production UI states must be the primary inventory group.');
if (!statePanel.includes('100%의 기준')) throw new Error('QA Studio must explain what 100% state coverage means.');
if (!statePanel.includes('직접 재현 추가 필요')) throw new Error('Known-state UI must reveal uncovered states instead of pretending they are covered.');

const qaPage = fs.readFileSync('src/app/qa/page.tsx', 'utf8');
if (!qaPage.includes('QaStateInventoryPanel')) throw new Error('QA Studio page must keep the known-state inventory reachable.');

const coverage = fs.readFileSync('src/qa/featureCoverageMap.ts', 'utf8');
if (!coverage.includes('QA_SURFACE_COVERAGE')) throw new Error('QA feature coverage map is required for future changed-screen selection.');
if (!coverage.includes('watchedPaths') || !coverage.includes('scenarioIds')) throw new Error('QA feature coverage map must link source paths to scenario ids.');

const studio = fs.readFileSync('src/qa/QaStudio.tsx', 'utf8');
if (!studio.includes('/qa/render?scenario=')) throw new Error('QA Studio must render scenarios inside the isolated browser viewport route.');
if (!studio.includes('Production writes')) throw new Error('QA Studio must visibly expose its no-Production-write invariant.');
if (!studio.includes('따라서 점검하기') || !studio.includes('점검 시작') || !studio.includes('이어서 점검')) throw new Error('QA Studio must default to a simple guided review entry flow.');
if (!studio.includes('지금 확인할 상황') || !studio.includes('지금 할 일') || !studio.includes('이러면 정상')) throw new Error('Guided review must explain the current situation, task, and success cue.');
if (!studio.includes('이상 없음 · 다음') || !studio.includes('문제 있음') || !studio.includes('잘 모르겠어요') || !studio.includes('나중에 확인')) throw new Error('Guided review must keep the operator decision set simple and explicit.');
if (!studio.includes('GUIDED_STORAGE_KEY') || !studio.includes('deferredScenarioIds')) throw new Error('Guided progress and deferred cases must survive refreshes within a build.');
if (!studio.includes('scenario.guide.requireAction') || !studio.includes('아직 앱 화면의 버튼을 눌러본 기록이 없어요')) throw new Error('Action-required guided cases must warn before an untested pass.');
if (!studio.includes('position:sticky') || !studio.includes('guidedActionBar')) throw new Error('Guided result controls must stay easy to reach while reviewing long screens.');
if (!studio.includes('핵심 점검') || !studio.includes('모든 상황') || !studio.includes('groupFilter')) throw new Error('Explore mode must retain core/all browsing and product-area filtering.');
if (!studio.includes('item.context.actor') || !studio.includes('item.context.trigger')) throw new Error('QA search/listing must retain who and when context.');
if (!studio.includes('reviewKey(') || !studio.includes('viewportId') || !studio.includes('locale')) throw new Error('QA operator reviews must be scoped to scenario + viewport + locale.');
if (!studio.includes("'blocked'") || !studio.includes('확인 불가')) throw new Error('QA Studio must retain an explicit unable-to-verify result in explore mode.');
if (!studio.includes('미확인으로 되돌리기')) throw new Error('QA Studio must let operators clear an accidental review result.');
if (!studio.includes('navigator.clipboard') || !studio.includes('현재 설정 링크 복사')) throw new Error('QA Studio must retain reproducible configuration links.');
if (!studio.includes('onLoad={() => setFrameState') || !studio.includes('다시 시도')) throw new Error('QA Studio must expose preview loading/recovery state.');
if (!studio.includes('viewport.height')) throw new Error('QA Studio must render the configured viewport height.');
if (!studio.includes('문제 종류') || !studio.includes('짧은 메모')) throw new Error('QA issue results must retain lightweight category and note capture.');
if (!studio.includes('고급 정보 보기')) throw new Error('QA Studio must keep technical inspection optional instead of default.');

const nextConfig = fs.readFileSync('next.config.mjs', 'utf8');
if (!nextConfig.includes("source: '/qa/:path*'")) throw new Error('QA routes must retain no-cache/no-index response headers.');

console.log(`QA Studio architecture gate passed with ${stateBlocks.length} inventoried states.`);
