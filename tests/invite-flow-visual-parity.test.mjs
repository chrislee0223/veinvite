import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [
  landingSource,
  languageSetupSource,
  polishSource,
  providerSource,
] = await Promise.all([
  readFile('src/components/InviteLandingV2.tsx', 'utf8'),
  readFile('src/components/LanguageSelectV2.tsx', 'utf8'),
  readFile('src/components/InviteFlowVisualPolish.tsx', 'utf8'),
  readFile('src/components/AppProviders.tsx', 'utf8'),
]);

test('invite landing uses the Home shell width and full-size brand', () => {
  assert.match(landingSource, /<Brand \/>/u);
  assert.doesNotMatch(landingSource, /<Brand compact \/>/u);
  assert.match(landingSource, /\.topBar \{ width:min\(100%,520px\)/u);
  assert.match(landingSource, /\.gameCard \{[\s\S]*width:min\(100%,520px\)/u);
  assert.match(landingSource, /\.reassurance \{ width:min\(100%,520px\)/u);
  assert.match(landingSource, /\.language \{ width:155px;[\s\S]*border:0;[\s\S]*background:transparent/u);
  assert.match(landingSource, /\.language select \{ width:155px;[\s\S]*height:40px;[\s\S]*border-radius:13px/u);
  assert.match(landingSource, /@media \(max-width:560px\)[\s\S]*\.language select \{ height:34px;/u);
});

test('first-time language setup stays on the same 520px visual frame', () => {
  assert.match(languageSetupSource, /<header className="topBar"><Brand \/><\/header>/u);
  assert.match(languageSetupSource, /\.topBar \{ width:min\(100%,520px\)/u);
  assert.match(languageSetupSource, /\.card \{[\s\S]*width:min\(100%,520px\)/u);
  assert.match(languageSetupSource, /border-radius:30px/u);
});

test('later invite states keep Home-scale shell, logo, picker, and stable chevron', () => {
  assert.match(polishSource, /\.inviteLanding,[\s\S]*\.centeredFlow,[\s\S]*\.appShell \{[\s\S]*520px/u);
  assert.match(polishSource, /\.centeredFlow > \.brandCompact img \{[\s\S]*width: 38px !important;[\s\S]*height: 38px !important;/u);
  assert.match(polishSource, /width: 155px !important;/u);
  assert.match(polishSource, /height: 40px !important;/u);
  assert.match(polishSource, /\.headerLanguageChevron \{[\s\S]*font-size: 0 !important;[\s\S]*rotate\(45deg\)/u);
  assert.match(polishSource, /@media \(max-width: 560px\)[\s\S]*height: 34px !important;/u);
});

test('invite visual parity polish is mounted once at app-provider level', () => {
  assert.match(providerSource, /import \{ InviteFlowVisualPolish \} from '\.\/InviteFlowVisualPolish';/u);
  assert.equal((providerSource.match(/<InviteFlowVisualPolish \/>/gu) ?? []).length, 1);
  assert.ok(
    providerSource.indexOf('<InviteFlowVisualPolish />') <
      providerSource.indexOf('<HeaderLanguagePickerPortal />'),
  );
});
