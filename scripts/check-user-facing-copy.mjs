import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const failures = [];
const read = (path) => readFileSync(join(root, path), 'utf8');

const locales = [
  'en', 'ko', 'zh', 'hi', 'es', 'ja',
  'it', 'tr', 'nl', 'de', 'fr',
];

function assertEveryLocale(source, label) {
  for (const locale of locales) {
    if (!new RegExp(`\\b${locale}:\\s*\\{`).test(source)) {
      failures.push(`${label} is incomplete for locale: ${locale}`);
    }
  }
}

const guideLabels = read('src/lib/i18n/guideCopy.ts');
assertEveryLocale(guideLabels, 'Guide labels');
if (!/inviteStepTitle/.test(guideLabels)) {
  failures.push('Guide labels must expose the first-step title without duplicating step descriptions.');
}
if (
  /Claim after verification|request your reward|검증 후 보상 수령|보상 수령을 요청|验证通过后领取奖励|सत्यापन के बाद इनाम माँगें|Solicita la recompensa|確認後に報酬を申請|Richiedi la ricompensa|Doğrulamadan sonra ödülü iste|Vraag de beloning aan|Belohnung nach Prüfung anfordern|Demandez la récompense/i.test(guideLabels)
) {
  failures.push('Retired manual-claim/final-verification guide copy must not return to the labels-only source.');
}

const rewardStep = read('src/lib/i18n/guideRewardStepCopy.ts');
assertEveryLocale(rewardStep, 'Guide reward step');
if (
  !/Reward is sent automatically after all missions are complete/.test(rewardStep) ||
  !/미션 완료 후 보상 자동 지급/.test(rewardStep) ||
  !/No claim is needed/.test(rewardStep) ||
  !/따로 신청할 필요가 없어요/.test(rewardStep)
) {
  failures.push('Guide reward step must clearly explain automatic payout with no manual claim.');
}
if (/payment queue|payout queue|reward queue|대기열|자동 등록|최종 검증|final verification|final checks/i.test(rewardStep)) {
  failures.push('Guide reward step exposes internal queue or final-verification jargon.');
}
if (
  !/すべてのミッション完了後、報酬は自動で送られます/.test(rewardStep) ||
  !/dopo aver completato tutte le missioni/.test(rewardStep) ||
  !/zodra alle missies zijn voltooid/.test(rewardStep) ||
  !/nach Abschluss aller Missionen/.test(rewardStep) ||
  !/une fois toutes les missions terminées/.test(rewardStep)
) {
  failures.push('Reviewed natural reward-step wording is missing from one or more locales.');
}

const inviteLanding = read('src/lib/i18n/inviteLandingCopy.ts');
assertEveryLocale(inviteLanding, 'Invite landing copy');
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
assertEveryLocale(guideFlow, 'Simplified guide flow');
if (!/친구가 모든 미션을 완료해야 초대가 완료돼요/.test(guideFlow)) {
  failures.push('Korean guide flow no longer explains completion in user terms.');
}
if (!/Une invitation ne compte qu’une fois que/.test(guideFlow)) {
  failures.push('French guide flow regressed to less natural referral wording.');
}
if (/final verification|final check|passes verification|최종 검증|최종 확인|검증을 통과/i.test(guideFlow)) {
  failures.push('Simplified guide flow exposes internal verification jargon.');
}

const missionStep = read('src/lib/i18n/guideMissionStepCopy.ts');
const eligibilityStep = read('src/lib/i18n/guideEligibilityCopy.ts');
assertEveryLocale(missionStep, 'Guide mission step');
assertEveryLocale(eligibilityStep, 'Guide eligibility copy');
if (
  !/three different VeBetterDAO dApps/.test(missionStep) ||
  !/서로 다른 VeBetterDAO dApp 3개/.test(missionStep) ||
  !/Allocation Voting/.test(missionStep)
) {
  failures.push('Guide mission step must preserve the exact three-dApp, VOT3, and Allocation Voting journey.');
}
if (
  !/एक बार वोट करना होगा/.test(missionStep) ||
  !/dans trois dApps VeBetterDAO différentes/.test(missionStep)
) {
  failures.push('Reviewed Hindi/French mission wording regressed.');
}
if (
  !/oldest of the last 12 completed rounds/.test(eligibilityStep) ||
  !/최근 완료된 12개 라운드 중 가장 오래된 라운드의 시작 시점부터 지금까지/.test(eligibilityStep)
) {
  failures.push('Returning-user guide copy must match the reviewed 12-completed-round dormancy window.');
}
if (
  /开始时点/.test(eligibilityStep) ||
  /पिछली 12 पूरी हुई राउंड/.test(eligibilityStep) ||
  /dall’inizio della più vecchia delle ultime 12/.test(eligibilityStep) ||
  /son 12 tamamlanmış turun en eskisinin/.test(eligibilityStep)
) {
  failures.push('Guide eligibility copy regressed to previously reviewed awkward wording.');
}
if (/claim your reward|request your reward|보상 수령을 요청|보상 받기/i.test(rewardStep)) {
  failures.push('Automatic reward guide copy must not regress toward a manual claim/request flow.');
}

const notification = read('src/lib/i18n/notificationCopy.ts');
assertEveryLocale(notification, 'Notification copy');
const allocationVotingMentions = notification.match(/Allocation Voting/g)?.length ?? 0;
if (allocationVotingMentions < locales.length * 2) {
  failures.push('Notification copy must identify Allocation Voting consistently across all locales.');
}
if (/governance vote|거버넌스 투표|VeBetter dApps|VeBetter dApp 3개/i.test(notification)) {
  failures.push('Notification copy regressed to generic governance or VeBetter-only mission wording.');
}
if (
  !/Your friend earned B3TR from 3 different VeBetterDAO dApps/.test(notification) ||
  !/초대한 친구가 서로 다른 VeBetterDAO dApp 3개에서 B3TR을 받았어요/.test(notification) ||
  !/Your B3TR reward has been sent to your wallet/.test(notification) ||
  !/B3TR 보상이 지갑으로 지급됐어요/.test(notification)
) {
  failures.push('Reviewed notification mission/reward wording is missing.');
}

const appGuide = read('src/components/AppGuide.tsx');
if (
  !/GUIDE_FLOW_COPY/.test(appGuide) ||
  !/GUIDE_MISSION_STEP_COPY/.test(appGuide) ||
  !/GUIDE_ELIGIBILITY_COPY/.test(appGuide) ||
  !/GUIDE_REWARD_STEP_COPY/.test(appGuide) ||
  !/title:\s*t\.inviteStepTitle/.test(appGuide)
) {
  failures.push('AppGuide is not using all reviewed multilingual guide sources and the labels-only first-step title.');
}
if (/t\.steps/.test(appGuide)) {
  failures.push('AppGuide must not depend on the retired duplicated guide step structure.');
}

const copyHardening = read('src/lib/i18n/copyHardening.ts');
assertEveryLocale(copyHardening, 'Shared copy hardening');
if (!/HOME_COPY/.test(copyHardening) || !/NOTIFICATION_COPY/.test(copyHardening)) {
  failures.push('Home and notification reward status copy is no longer protected from internal jargon.');
}
if (!/VeInvite에서 보상 상태를 확인할 수 있어요/.test(copyHardening)) {
  failures.push('Korean mission-complete reward status guidance regressed.');
}
if (
  !/INVITEE_ELIGIBILITY_COPY/.test(copyHardening) ||
  !/oldest of the last 12 completed rounds/.test(copyHardening) ||
  !/Allocation Voting 참여 기록/.test(copyHardening)
) {
  failures.push('Invitee eligibility copy is no longer aligned with the reviewed public rule in all locales.');
}
if (
  /开始时点/.test(copyHardening) ||
  /पिछली 12 पूरी हुई राउंड/.test(copyHardening) ||
  /dall’inizio della più vecchia delle ultime 12/.test(copyHardening) ||
  /son 12 tamamlanmış turun en eskisinin/.test(copyHardening)
) {
  failures.push('Invitee eligibility hardening regressed to previously reviewed awkward wording.');
}

const leaderboardPolish = read('src/lib/i18n/secondaryPageCopyHardening.ts');
assertEveryLocale(leaderboardPolish, 'Secondary-page copy hardening');
if (
  !/친구가 모든 미션을 완료하고 초대한 사람이 B3TR 보상을 받은 초대만 순위에 반영해요/.test(leaderboardPolish) ||
  !/VeInvite를 통해 유입된 사용자/.test(leaderboardPolish) ||
  !/completed:\s*'초대 횟수'/.test(leaderboardPolish) ||
  !/earned:\s*'누적 보상'/.test(leaderboardPolish)
) {
  failures.push('Leaderboard copy no longer matches the reviewed acquisition, invite-count, and reward labels.');
}
if (!/earned:\s*'कुल इनाम'/.test(leaderboardPolish)) {
  failures.push('Hindi leaderboard reward label regressed to less natural wording.');
}
if (/VeInvite 온보딩 완료 사용자|completed:\s*'완료 초대'|earned:\s*'누적 B3TR'/.test(leaderboardPolish)) {
  failures.push('Leaderboard copy regressed to retired onboarding/completed-invite labels.');
}

const settingsCopy = read('src/lib/i18n/settingsCopy.ts');
assertEveryLocale(settingsCopy, 'Settings copy');
if (
  /restored when you return/.test(settingsCopy) ||
  /se restaura cuando vuelves/.test(settingsCopy) ||
  /ripristinata quando torni/.test(settingsCopy) ||
  /geri yüklenir/.test(settingsCopy) ||
  /hersteld wanneer je terugkomt/.test(settingsCopy) ||
  /bei deiner Rückkehr wiederhergestellt/.test(settingsCopy)
) {
  failures.push('Settings language persistence copy regressed to mechanical translation wording.');
}

const entryRejection = read('src/lib/i18n/entryRejectionCopy.ts');
if (!/Du kannst VeBetterDAO weiterhin ganz normal nutzen/.test(entryRejection)) {
  failures.push('German rejection help must keep the same direct user-facing tone as the rest of the locale.');
}

const appProviders = read('src/components/AppProviders.tsx');
if (
  !/import '@\/lib\/i18n\/copyHardening';/.test(appProviders) ||
  !/import '@\/lib\/i18n\/secondaryPageCopyHardening';/.test(appProviders)
) {
  failures.push('Global multilingual copy hardening must stay mounted in AppProviders.');
}

const rewardReceipt = read('src/lib/i18n/rewardReceiptCopy.ts');
if (/verified VeInvite referral reward|검증을 통과한 VeInvite 초대 보상/i.test(rewardReceipt)) {
  failures.push('Reward receipt copy exposes unnecessary verification jargon.');
}
if (!/VeInvite 초대 보상이 이 지갑으로 지급됐어요/.test(rewardReceipt)) {
  failures.push('Korean reward receipt copy regressed.');
}

const legalConsent = read('src/lib/i18n/legalConsentCopy.ts');
if (!/acceptAll:\s*'모두 동의'/.test(legalConsent)) {
  failures.push('Korean legal consent action should use natural agreement wording.');
}
if (
  !/non ti verrà chiesto di nuovo il consenso/.test(legalConsent) ||
  !/niet opnieuw om toestemming/.test(legalConsent)
) {
  failures.push('Reviewed Italian/Dutch consent wording regressed.');
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