import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [localeSource, conversionSource, providerSource, guidePolicySource] =
  await Promise.all([
    readFile('src/lib/i18n/locales.ts', 'utf8'),
    readFile('src/lib/i18n/inviteeConversionPolicyPolish.ts', 'utf8'),
    readFile('src/components/AppProviders.tsx', 'utf8'),
    readFile('src/lib/i18n/guideVot3PolicyPolish.ts', 'utf8'),
  ]);

const rtlLocales = [
  ...localeSource.matchAll(
    /\{ locale: '([^']+)'[^\n]+direction: 'rtl'/g,
  ),
].map((match) => match[1]);

function localeBlock(locale) {
  const key = locale.includes('-') ? `'${locale}'` : locale;
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = conversionSource.match(
    new RegExp(`\\n  ${escaped}: \\{([\\s\\S]*?)\\n  \\},`),
  );
  assert.ok(match, `missing runtime mission-policy copy for ${locale}`);
  return match[1];
}

test('every RTL locale uses word-based B3TR to VOT3 copy in the final runtime patch', () => {
  assert.deepEqual(rtlLocales.sort(), ['ar', 'arz', 'ur']);

  for (const locale of rtlLocales) {
    const block = localeBlock(locale);
    assert.match(block, /B3TR/);
    assert.match(block, /VOT3/);
    assert.doesNotMatch(
      block,
      /→|←/,
      `${locale} must not use bidi-sensitive arrows in the final runtime mission copy`,
    );
  }
});

test('RTL-safe mission policy is applied before the inviter Guide reuses it', () => {
  const conversionIndex = providerSource.indexOf(
    "@/lib/i18n/inviteeConversionPolicyPolish",
  );
  const guideIndex = providerSource.indexOf(
    "@/lib/i18n/guideVot3PolicyPolish",
  );

  assert.ok(conversionIndex >= 0);
  assert.ok(guideIndex > conversionIndex);
  assert.match(
    guidePolicySource,
    /inviteeMission\.conversionMissionDescription/,
  );
});
