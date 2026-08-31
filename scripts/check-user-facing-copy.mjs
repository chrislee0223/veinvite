import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const failures = [];
const read = (path) => readFileSync(join(root, path), 'utf8');

const locales = [
  'en', 'ko', 'zh', 'hi', 'es', 'ja',
  'it', 'tr', 'nl', 'de', 'fr',
];

const rewardStep = read('src/lib/i18n/guideRewardStepCopy.ts');
for (const locale of locales) {
  if (!new RegExp(`\\b${locale}:\\s*\\{`).test(rewardStep)) {
    failures.push(`Guide reward step is incomplete for locale: ${locale}`);
  }
}
if (
  !/Reward is sent automatically after the missions/.test(rewardStep) ||
  !/미션 완료 후 보상 자동 지급/.test(rewardStep) ||
  !/No claim is needed/.test(rewardStep) ||
  !/따로 신청할 필요가 없어요/.test(rewardStep)
) {
  failures.push('Guide reward step must clearly explain automatic payout with no manual claim.');
}
if (/payment queue|payout queue|reward queue|대기열|자동 등록|최종 검증|final verification|final checks/i.test(rewardStep)) {
  failures.push('Guide reward step exposes internal queue or final-verification jargon.');
}

const inviteLanding = read('src/lib/i18n/inviteLandingCopy.ts');
for (const locale of locales) {
  if (!new RegExp(`\\b${locale}:\\s*\\{`).test(inviteLanding)) {
    failures.push(`Invite landing copy is incomplete for locale: ${locale}`);
  }
}
if (
  !/소요 시간은 달라질 수 있어요/.test(inviteLanding) ||
  !/所要時間は状況により異なります/.test(inviteLanding) ||
  !/El tiempo puede variar/.test(inviteLanding)
) {
  failures.push('Reviewed natural-language timing copy is missing from key locales.');
}
if (/About 10 min|약 10분|約10分|10 minutos/i.test(inviteLanding)) {
  failures.push('Invite landing must not promise a fixed mission completion time.');
}

const guideFlow = read('src/lib/i18n/guideFlowCopy.ts');
for (const locale of locales) {
  if (!new RegExp(`\\b${locale}:\\s*\\{`).test(guideFlow)) {
    failures.push(`Simplified guide flow is incomplete for locale: ${locale}`);
  }
}
if (!/친구가 모든 미션을 완료해야 초대가 완료돼요/.test(guideFlow)) {
  failures.push('Korean guide flow no longer explains completion in user terms.');
}
if (/final verification|final check|passes verification|최종 검증|최종 확인|검증을 통과/i.test(guideFlow)) {
  failures.push('Simplified guide flow exposes internal verification jargon.');
}

const missionStep = read('src/lib/i18n/guideMissionStepCopy.ts');
const eligibilityStep = read('src/lib/i18n/guideEligibilityCopy.ts');
for (const locale of locales) {
  if (!new RegExp(`\\b${locale}:\\s*\\{`).test(missionStep)) {
    failures.push(`Guide mission step is incomplete for locale: ${locale}`);
  }
  if (!new RegExp(`\\b${locale}:\\s*\\{`).test(eligibilityStep)) {
    failures.push(`Guide eligibility copy is incomplete for locale: ${locale}`);
  }
}
if (
  !/three different VeBetterDAO dApps/.test(missionStep) ||
  !/서로 다른 VeBetterDAO dApp 3개/.test(missionStep) ||
  !/Allocation Voting/.test(missionStep)
) {
  failures.push('Guide mission step must preserve the exact three-dApp, VOT3, and Allocation Voting journey.');
}
if (
  !/oldest of the last 12 completed rounds/.test(eligibilityStep) ||
  !/최근 완료된 12개 라운드 중 가장 오래된 라운드의 시작 시점부터 지금까지/.test(eligibilityStep)
) {
  failures.push('Returning-user guide copy must match the reviewed 12-completed-round dormancy window.');
}
if (/claim your reward|request your reward|보상 수령을 요청|보상 받기/i.test(rewardStep)) {
  failures.push('Automatic reward guide copy must not regress toward a manual claim/request flow.');
}

const appGuide = read('src/components/AppGuide.tsx');
if (
  !/GUIDE_FLOW_COPY/.test(appGuide) ||
  !/GUIDE_MISSION_STEP_COPY/.test(appGuide) ||
  !/GUIDE_ELIGIBILITY_COPY/.test(appGuide) ||
  !/GUIDE_REWARD_STEP_COPY/.test(appGuide)
) {
  failures.push('AppGuide is not using all reviewed multilingual guide sources.');
}

const copyHardening = read('src/lib/i18n/copyHardening.ts');
if (!/HOME_COPY/.test(copyHardening) || !/NOTIFICATION_COPY/.test(copyHardening)) {
  failures.push('Home and notification reward status copy is no longer protected from internal jargon.');
}
if (!/VeInvite에서 보상 상태를 확인할 수 있어요/.test(copyHardening)) {
  failures.push('Korean mission-complete reward status guidance regressed.');
}

const finalUi = read('src/app/final-ui-hardening.css');
if (!/\.leaderboardPage \.impactCard > p/.test(finalUi)) {
  failures.push('Leaderboard default impact card no longer keeps the total-only presentation.');
}
if (!/\.leaderboardPage \.impactDialog \.reportingSince/.test(finalUi)) {
  failures.push('Leaderboard impact breakdown exposes retired reporting detail.');
}
if (!/@media \(max-width:420px\)[\s\S]*\.appHeader \.chip[\s\S]*display:none\s*!important/.test(finalUi)) {
  failures.push('Invitee mission header can regress to an overcrowded small-phone layout.');
}
if (!/body:has\(\.modalBackdrop\)/.test(finalUi) || !/overflow:hidden/.test(finalUi)) {
  failures.push('Full-screen dialogs can regress to background scrolling on touch devices.');
}
if (!/env\(safe-area-inset-top\)/.test(finalUi) || !/env\(safe-area-inset-bottom\)/.test(finalUi)) {
  failures.push('Phone/app safe-area padding is missing from the reviewed mobile shell.');
}

const layout = read('src/app/layout.tsx');
if (!/viewportFit:\s*'cover'/.test(layout)) {
  failures.push('Viewport is not prepared for edge-to-edge app safe areas.');
}

const legalMemory = read('src/components/LegalNavigationMemory.tsx');
const legalPage = read('src/components/LocalizedLegalPage.tsx');
if (!/veinvite-legal-return/.test(legalMemory)) {
  failures.push('Legal navigation no longer remembers the in-app origin.');
}
if (!/LEGAL_RETURN_STORAGE_KEY/.test(legalPage) || !/window\.history\.back\(\)/.test(legalPage)) {
  failures.push('Legal back navigation can no longer safely return to the prior VeInvite screen.');
}

const uiTestPage = read('src/app/ui-test/page.tsx');
const guidePreview = read('src/components/GuideUiPreview.tsx');
if (!/GuideUiPreview/.test(uiTestPage) || !/<AppGuide locale=\{locale\}/.test(guidePreview)) {
  failures.push('UI test page is not rendering the real production Guide component.');
}

if (failures.length > 0) {
  console.error('User-facing copy/UX gate failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('User-facing copy/UX gate passed.');
