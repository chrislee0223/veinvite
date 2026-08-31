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
if (!/Get your reward after the mission/.test(rewardStep) || !/미션 완료 후 보상 받기/.test(rewardStep)) {
  failures.push('Guide step 3 no longer matches the reviewed mission-complete reward wording.');
}
if (/queued automatically|payment queue|payout queue|reward queue|대기열|자동 등록|최종 검증|final verification|final checks/i.test(rewardStep)) {
  failures.push('Guide step 3 exposes retired queue or final-verification jargon.');
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

const appGuide = read('src/components/AppGuide.tsx');
if (!/GUIDE_FLOW_COPY/.test(appGuide) || !/GUIDE_REWARD_STEP_COPY/.test(appGuide)) {
  failures.push('AppGuide is not using the reviewed simplified guide sources.');
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
