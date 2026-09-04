import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const policySource = read('src/lib/i18n/inviteeConversionPolicyPolish.ts');
const localesSource = read('src/lib/i18n/locales.ts');
const providersSource = read('src/components/AppProviders.tsx');

test('conversion and allocation-vote copy matches the final mission policy in every locale', () => {
  const supported = [
    ...localesSource.matchAll(/locale:\s*'([^']+)'/g),
  ].map((match) => match[1]);

  const patched = [
    ...policySource.matchAll(/^  (?:'([^']+)'|([a-z]+)):\s*\{/gm),
  ].map((match) => match[1] ?? match[2]);

  assert.deepEqual(
    [...new Set(patched)].sort(),
    [...new Set(supported)].sort(),
  );

  assert.match(
    policySource,
    /conversionMission: 'B3TR → VOT3 1회 전환'/,
  );
  assert.match(
    policySource,
    /conversionMissionDescription: '수량과 관계없이 B3TR을 VOT3로 1회 전환하면 완료돼요\.'/,
  );
  assert.match(
    policySource,
    /conversionMissionDescription: 'Convert any amount of B3TR to VOT3 once to complete this mission\.'/,
  );
  assert.match(
    policySource,
    /voteMission: '보상 배분 투표 1회 참여'/,
  );
  assert.match(
    policySource,
    /voteMissionDescription: 'VeBetterDAO에서 보상 배분 투표에 1회 참여하세요\.'/,
  );
  assert.match(
    policySource,
    /voteMissionDescription: 'Participate in VeBetterDAO Allocation Voting once\.'/,
  );

  assert.doesNotMatch(policySource, /at least 1 B3TR/i);
  assert.doesNotMatch(policySource, /최소\s*1\s*B3TR/);
  assert.doesNotMatch(policySource, /전환을 완료한 뒤/);
  assert.doesNotMatch(policySource, /after the qualifying B3TR/i);
  assert.doesNotMatch(policySource, /1000000000000000000/);
});

test('the mission policy patch is loaded after shared and mission copy hardening', () => {
  const hardeningIndex = providersSource.indexOf(
    "import '@/lib/i18n/copyHardening';",
  );
  const missionPolishIndex = providersSource.indexOf(
    "import '@/lib/i18n/inviteeMissionCopyPolish';",
  );
  const policyIndex = providersSource.indexOf(
    "import '@/lib/i18n/inviteeConversionPolicyPolish';",
  );

  assert.ok(hardeningIndex >= 0);
  assert.ok(missionPolishIndex > hardeningIndex);
  assert.ok(policyIndex > missionPolishIndex);
});
