import {
  existsSync,
  readFileSync,
} from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const failures = [];

function read(path) {
  return readFileSync(join(root, path), 'utf8');
}

function requireFile(path) {
  if (!existsSync(join(root, path))) {
    failures.push(`Missing required UI asset: ${path}`);
  }
}

for (const code of [
  'us', 'kr', 'cn', 'in', 'es', 'jp',
  'it', 'tr', 'nl', 'de', 'fr',
]) {
  requireFile(`public/flags/${code}.svg`);
}

const spainFlag = read('public/flags/es.svg');
if (
  !/viewBox="0 0 750 500"/.test(spainFlag) ||
  !/translate\(170 182\)/.test(spainFlag)
) {
  failures.push(
    'Spain flag must retain its reviewed small-screen crest detail instead of regressing to a plain red-yellow-red placeholder.',
  );
}

const pickerFiles = {
  'src/components/LanguageSelectV2.tsx': [
    /\.symbol\s*\{[^}]*background\s*:\s*#fff/i,
  ],
  'src/components/AppSettings.tsx': [
    /\.languageSymbol\s*,\s*\.languageOptionSymbol\s*\{[^}]*background\s*:\s*#fff/i,
  ],
  'src/components/HeaderLanguagePickerPortal.tsx': [
    /\.headerLanguageFlag\s*,\s*\.headerLanguageOptionFlag\s*\{[^}]*background\s*:\s*#fff/i,
  ],
};

for (const [path, forbiddenPatterns] of Object.entries(pickerFiles)) {
  const source = read(path);
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(source)) {
      failures.push(`Artificial white flag background returned in ${path}`);
    }
  }
}

const inviteLanding = read('src/components/InviteLandingV2.tsx');
if (!/<select\s+className="languageSelect"/.test(inviteLanding)) {
  failures.push('Invite landing language control is not enhanced with app flags.');
}

const inviteLandingCopy = read('src/lib/i18n/inviteLandingCopy.ts');
if (/About 10 min|약 10분|Unos 10 min|約10分|Circa 10 min|Yaklaşık 10 dk|Ongeveer 10 min|Etwa 10 Min|Environ 10 min/.test(inviteLandingCopy)) {
  failures.push('Invite landing must not promise a fixed completion time.');
}
if (!/No VeInvite fee/.test(inviteLandingCopy) || !/VeInvite 이용료 없음/.test(inviteLandingCopy)) {
  failures.push('Invite landing must describe cost as no VeInvite fee instead of claiming all activity is free.');
}
if (/Just three simple steps|세 단계만 완료하면 돼요|只需完成三个步骤|Solo tres pasos sencillos|3つのステップで完了|Solo tre semplici passaggi|Yalnızca üç kolay adım|Slechts drie eenvoudige stappen|Nur drei einfache Schritte|Trois étapes simples/.test(inviteLandingCopy)) {
  failures.push('Invite landing must not imply the detailed onboarding contains exactly three missions.');
}

const inviteeClient = read('src/components/InviteeClient.tsx');
if (!/className="languageSelect"/.test(inviteeClient)) {
  failures.push('Invitee language control is not enhanced with app flags.');
}
if (!/class InviteRequestError extends Error/.test(inviteeClient)) {
  failures.push('Invitee transient request errors are not distinguished from invalid links.');
}
if (!/console\.error\('Failed to claim invite:'/m.test(inviteeClient)) {
  failures.push('Invite claim flow can regress to an unhandled checking-state failure.');
}
if (!/active_existing_user/.test(inviteeClient) || !/setErrorCode\('existing'\)/.test(inviteeClient)) {
  failures.push('Active-existing users must continue to receive a dedicated ineligibility state.');
}

const invitePage = read('src/app/i/[code]/page.tsx');
if (/InviteeReviewAutoRefresh/.test(invitePage)) {
  failures.push('Invite page has duplicate background polling alongside InviteeClient.');
}

const inviteProgressRoute = read('src/app/api/invites/[code]/route.ts');
if (!/INVITE_CODE_PATTERN/.test(inviteProgressRoute)) {
  failures.push('Public invite progress endpoint is missing early invite-code validation.');
}
if (!/scope:\s*'invite_progress_code'/.test(inviteProgressRoute)) {
  failures.push('Public invite progress endpoint is missing per-invite throttling.');
}
if (!/scope:\s*'invite_progress_ip'/.test(inviteProgressRoute)) {
  failures.push('Public invite progress endpoint is missing per-IP throttling.');
}

const homeRefresh = read('src/components/InviteStatusAutoRefresh.tsx');
if (!/POLL_INTERVAL_MS\s*=\s*30_000/.test(homeRefresh)) {
  failures.push('Home status polling should stay at the reviewed 30-second interval.');
}
if (!/EVIDENCE_SYNC_INTERVAL_MS\s*=\s*5 \* 60_000/.test(homeRefresh)) {
  failures.push('Inviter evidence reconciliation fallback is missing or unbounded.');
}

const walletSessionGate = read(
  'src/components/WalletSessionGate.tsx',
);
if (
  !/addEventListener\(\s*'wallet_disconnected'/.test(walletSessionGate) ||
  !/clearWalletSession\(\)/.test(walletSessionGate)
) {
  failures.push(
    'Wallet disconnect events must revoke the VeInvite server session instead of leaving a stale authentication cookie.',
  );
}

const uiSafety = read('src/app/ui-safety.css');
if (!/\.claimAction\s*\{[^}]*display\s*:\s*none\s*!important/i.test(uiSafety)) {
  failures.push('Legacy manual Claim UI safety rule is missing.');
}

const finalUi = read('src/app/final-ui-hardening.css');
if (!/\.topBar\s+\.utilityActions\s+\.languageSelect\s*\{[^}]*display\s*:\s*none\s*!important/is.test(finalUi)) {
  failures.push('Main home header language selector is visible outside Settings.');
}
if (!/max-width\s*:\s*112px/.test(finalUi)) {
  failures.push('Narrow-screen wallet-chip safeguard is missing.');
}
if (!/flex-direction\s*:\s*row\s*!important/.test(finalUi)) {
  failures.push('Mobile wallet and notification controls can regress to a stacked header layout.');
}
if (!/padding-left\s*:\s*16px\s*!important/.test(finalUi) || !/padding-right\s*:\s*16px\s*!important/.test(finalUi)) {
  failures.push('Reviewed 16px mobile horizontal gutter is missing.');
}
if (!/missionCard[\s\S]*width\s*:\s*min\(100%,560px\)\s*!important/.test(finalUi)) {
  failures.push('Main home content width is not aligned to the reviewed 560px app rhythm.');
}
if (!/bottomNavigation[\s\S]*width\s*:\s*min\(100%,560px\)\s*!important/.test(finalUi)) {
  failures.push('Bottom navigation width is not aligned to the reviewed core app width.');
}
if (!/labScreen[\s\S]*missionCard[\s\S]*width\s*:\s*min\(100%,560px\)\s*!important/.test(finalUi)) {
  failures.push('UI test home width can drift from the reviewed production width.');
}
if (!/labScreen[\s\S]*previewNavigation[\s\S]*left\s*:\s*16px\s*!important/.test(finalUi) || !/labScreen[\s\S]*previewNavigation[\s\S]*right\s*:\s*16px\s*!important/.test(finalUi)) {
  failures.push('UI test bottom navigation no longer mirrors the reviewed production gutter.');
}
if (!/min-height\s*:\s*100svh/.test(finalUi)) {
  failures.push('Invite and mission shells are missing the reviewed stable mobile viewport fallback.');
}
if (!/@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*\.pulseDot[\s\S]*\.spinnerLarge[\s\S]*animation\s*:\s*none\s*!important/i.test(finalUi)) {
  failures.push('Motion-heavy progress indicators must respect the OS reduced-motion preference.');
}

const localizedTypography = read('src/app/localized-typography.css');
if (!/\.labScreen/.test(localizedTypography)) {
  failures.push('UI test typography is not covered by the production locale-aware wrapping rules.');
}
if (!/bottomNavigation button span,[\s\S]*previewNavigation button span[\s\S]*white-space\s*:\s*nowrap\s*!important/i.test(localizedTypography)) {
  failures.push('Persistent navigation labels must remain single-line in production and UI test views.');
}
if (/bottomNavigation button span[\s\S]*-webkit-line-clamp\s*:\s*2/i.test(localizedTypography)) {
  failures.push('Legacy two-line bottom-navigation behavior returned.');
}

const headerLanguagePortal = read(
  'src/components/HeaderLanguagePickerPortal.tsx',
);
if (!/!select\.closest\('\.utilityActions'\)/.test(headerLanguagePortal)) {
  failures.push('Global flag picker can re-create the removed main home language control.');
}
if (
  !/new MutationObserver\(scheduleAttach\)/.test(headerLanguagePortal) ||
  !/requestAnimationFrame/.test(headerLanguagePortal) ||
  !/cancelAnimationFrame/.test(headerLanguagePortal)
) {
  failures.push('Header language picker DOM observation must stay frame-bounded.');
}

const rewardForecastPortal = read(
  'src/components/PublicRewardForecastPortal.tsx',
);
if (
  !/new MutationObserver\(scheduleAttach\)/.test(rewardForecastPortal) ||
  !/requestAnimationFrame/.test(rewardForecastPortal) ||
  !/cancelAnimationFrame/.test(rewardForecastPortal) ||
  !/if \(!impactCard\)[\s\S]*detach\(\)/.test(rewardForecastPortal)
) {
  failures.push('Reward forecast portal must detach cleanly and keep DOM observation frame-bounded.');
}

const copyHardening = read('src/lib/i18n/copyHardening.ts');
if (!/ENTRY_REJECTION_COPY/.test(copyHardening)) {
  failures.push('Invite rejection copy must use the reviewed shared privacy-safe source.');
}

const entryRejectionCopy = read('src/lib/i18n/entryRejectionCopy.ts');
for (const locale of [
  'en', 'ko', 'zh', 'hi', 'es', 'ja',
  'it', 'tr', 'nl', 'de', 'fr',
]) {
  if (!new RegExp(`\\b${locale}:\\s*\\{`).test(entryRejectionCopy)) {
    failures.push(`Invite rejection copy is incomplete for locale: ${locale}`);
  }
}
if (/B3TR|Allocation Voting|12\s*(completed|round|rounds)|12개|transaction|txId|checkedBlock|dormancy/i.test(entryRejectionCopy)) {
  failures.push('Public invite rejection copy exposes eligibility evidence or timing details that could help users reverse-engineer the rule.');
}
if (!/Recent VeBetterDAO activity was found/.test(entryRejectionCopy) || !/최근 VeBetterDAO 활동 이력이 확인/.test(entryRejectionCopy)) {
  failures.push('Invite rejection copy no longer gives users a clear high-level reason.');
}

const uiTestPage = read('src/app/ui-test/page.tsx');
if (!/InviteRejectionPreview/.test(uiTestPage)) {
  failures.push('UI test page must mirror the production invite-ineligibility feedback.');
}
if (!/PRODUCTION PARITY/.test(uiTestPage)) {
  failures.push('UI test page must state that it mirrors the production UI baseline.');
}
requireFile('src/components/InviteRejectionPreview.tsx');

const rejectionPreview = read('src/components/InviteRejectionPreview.tsx');
if (!/INVITEE_COPY/.test(rejectionPreview) || !/t\.errors\.existing/.test(rejectionPreview) || !/t\.existingHelp/.test(rejectionPreview)) {
  failures.push('UI test rejection preview is not using the exact production rejection copy.');
}

const legalCopy = read('src/lib/i18n/legalCopy.ts');
for (const locale of [
  'en', 'ko', 'zh', 'hi', 'es', 'ja',
  'it', 'tr', 'nl', 'de', 'fr',
]) {
  const matches = legalCopy.match(new RegExp(`\\b${locale}:\\s*\\{`, 'g')) ?? [];
  if (matches.length < 2) {
    failures.push(`Legal privacy and terms copy is incomplete for locale: ${locale}`);
  }
}

const privacyPage = read('src/app/privacy/page.tsx');
const termsPage = read('src/app/terms/page.tsx');
if (!/LocalizedLegalPage kind="privacy"/.test(privacyPage)) {
  failures.push('Privacy page is not routed through the localized legal renderer.');
}
if (!/LocalizedLegalPage kind="terms"/.test(termsPage)) {
  failures.push('Terms page is not routed through the localized legal renderer.');
}

const layout = read('src/app/layout.tsx');
if (!/LocaleHydrationShield/.test(layout)) {
  failures.push('Initial locale hydration shield is missing and can expose an English first-paint flash.');
}
if (!/final-ui-hardening\.css/.test(layout)) {
  failures.push('Final production UI safeguards are not loaded by the root layout.');
}

if (failures.length > 0) {
  console.error('UI stability gate failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('UI stability gate passed.');
