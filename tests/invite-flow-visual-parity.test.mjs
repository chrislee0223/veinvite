import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [
  landingSource,
  languageSetupSource,
  polishSource,
  providerSource,
  pickerSource,
  finalCopySource,
] = await Promise.all([
  readFile('src/components/InviteLandingV2.tsx', 'utf8'),
  readFile('src/components/LanguageSelectV2.tsx', 'utf8'),
  readFile('src/components/InviteFlowVisualPolish.tsx', 'utf8'),
  readFile('src/components/AppProviders.tsx', 'utf8'),
  readFile('src/components/HeaderLanguagePickerPortal.tsx', 'utf8'),
  readFile('src/lib/i18n/inviteLandingFinalPolish.ts', 'utf8'),
]);

test('invite landing uses the Home shell and removes nonessential decoration', () => {
  assert.match(landingSource, /<Brand \/>/u);
  assert.doesNotMatch(landingSource, /<Brand compact \/>/u);
  assert.match(landingSource, /\.topBar \{ width:min\(100%,520px\)/u);
  assert.match(landingSource, /\.gameCard \{[\s\S]*width:min\(100%,520px\)/u);
  assert.match(landingSource, /\.reassurance \{ width:min\(100%,520px\)/u);
  assert.doesNotMatch(landingSource, /className="inviteBadge"/u);
  assert.doesNotMatch(landingSource, /className="rewardVisual"/u);
  assert.doesNotMatch(landingSource, /className="rewardLabel"/u);
  assert.doesNotMatch(landingSource, /className="meta"/u);
  assert.doesNotMatch(landingSource, /\.inviteBadge\s*\{/u);
  assert.doesNotMatch(landingSource, /\.rewardVisual\s*\{/u);
  assert.doesNotMatch(landingSource, /\.meta\s*\{/u);
});

test('invite landing language control keeps width and adds vertical breathing room', () => {
  assert.match(landingSource, /\.language \{ width:155px;/u);
  assert.match(
    landingSource,
    /\.language select \{ width:155px;[\s\S]*min-height:48px;[\s\S]*padding:7px 34px 7px 12px/u,
  );
  assert.match(
    landingSource,
    /@media \(max-width:560px\)[\s\S]*\.language \{ width:155px;[\s\S]*\.language select \{ width:155px; min-height:48px;/u,
  );
});

test('first-time language setup stays on the same 520px visual frame', () => {
  assert.match(languageSetupSource, /<header className="topBar"><Brand \/><\/header>/u);
  assert.match(languageSetupSource, /\.topBar \{ width:min\(100%,520px\)/u);
  assert.match(languageSetupSource, /\.card \{[\s\S]*width:min\(100%,520px\)/u);
  assert.match(languageSetupSource, /border-radius:30px/u);
});

test('later invite states keep Home-scale shell and the same picker width', () => {
  assert.match(polishSource, /\.inviteLanding,[\s\S]*\.centeredFlow,[\s\S]*\.appShell \{[\s\S]*520px/u);
  assert.match(polishSource, /\.centeredFlow > \.brandCompact img \{[\s\S]*width: 38px !important;[\s\S]*height: 38px !important;/u);
  assert.match(polishSource, /\.centeredFlow > label > span\[aria-hidden='true'\],[\s\S]*display: none !important;/u);
  assert.match(polishSource, /width: 155px !important;/u);
  assert.match(polishSource, /min-height: 48px !important;/u);
  assert.match(polishSource, /padding: 7px 34px 7px 12px !important;/u);
});

test('enhanced language picker keeps horizontal geometry and adds vertical padding', () => {
  assert.doesNotMatch(pickerSource, />⌄<\/span>/u);
  assert.match(pickerSource, /headerLanguagePickerMount[^\n]*width:155px/u);
  assert.match(pickerSource, /headerLanguageTrigger[^\n]*min-height:48px/u);
  assert.match(pickerSource, /grid-template-columns:24px minmax\(0,1fr\) 14px/u);
  assert.match(pickerSource, /padding:7px 14px 7px 12px/u);
  assert.match(pickerSource, /\.headerLanguageFlag \{ width:24px; height:16px;/u);
  assert.match(pickerSource, /\.headerLanguageChevron \{ width:8px; height:8px;[\s\S]*rotate\(45deg\)/u);
});

test('invite error icon is centered with CSS geometry instead of font metrics', () => {
  assert.match(polishSource, /\.errorIcon \{[\s\S]*width: 96px !important;[\s\S]*height: 96px !important;[\s\S]*font-size: 0 !important;/u);
  assert.match(polishSource, /\.errorIcon::before,[\s\S]*\.errorIcon::after[\s\S]*left: 50%;[\s\S]*top: 50%;/u);
  assert.match(polishSource, /rotate\(45deg\)/u);
  assert.match(polishSource, /rotate\(-45deg\)/u);
});

test('final invite headline copy is applied after expanded locales register', () => {
  assert.match(finalCopySource, /Record<[\s\S]*SupportedLocale/u);
  assert.match(finalCopySource, /rewardTitle: 'Get started with VeBetterDAO'/u);
  assert.match(finalCopySource, /rewardTitle: 'VeBetterDAO 시작하기'/u);
  assert.match(finalCopySource, /'zh-tw': \{/u);
  assert.match(finalCopySource, /pcm: \{/u);
  assert.match(finalCopySource, /arz: \{/u);
  assert.ok(
    providerSource.indexOf("import '@/lib/i18n/localePacks/registerExpandedLocales';") <
      providerSource.indexOf("import '@/lib/i18n/inviteLandingFinalPolish';"),
  );
});

test('invite visual parity polish is mounted once at app-provider level', () => {
  assert.match(providerSource, /import \{ InviteFlowVisualPolish \} from '\.\/InviteFlowVisualPolish';/u);
  assert.equal((providerSource.match(/<InviteFlowVisualPolish \/>/gu) ?? []).length, 1);
  assert.ok(
    providerSource.indexOf('<InviteFlowVisualPolish />') <
      providerSource.indexOf('<HeaderLanguagePickerPortal />'),
  );
});
