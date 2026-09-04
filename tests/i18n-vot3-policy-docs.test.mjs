import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const currentPolicyDocs = [
  'README_KO.md',
  'docs/PUBLIC_FAQ_KO_EN.md',
  'docs/ARCHITECTURE.md',
  'docs/SOCIAL_LAUNCH_COPY_KO_EN.md',
  'docs/NEXT_STEPS_KO.md',
];

test('current VOT3 guidance never reintroduces the old 1-B3TR minimum', () => {
  for (const path of currentPolicyDocs) {
    const source = read(path);
    assert.doesNotMatch(source, /최소\s*1\s*B3TR/i, path);
    assert.doesNotMatch(source, /at least\s*1\s*B3TR/i, path);
  }
});

test('public mission guidance states one real positive conversion', () => {
  const faq = read('docs/PUBLIC_FAQ_KO_EN.md');
  const social = read('docs/SOCIAL_LAUNCH_COPY_KO_EN.md');
  const architecture = read('docs/ARCHITECTURE.md');
  const readmeKo = read('README_KO.md');
  const nextStepsKo = read('docs/NEXT_STEPS_KO.md');

  assert.match(
    faq,
    /B3TR → VOT3를 실제로 1회 전환하기 \(0보다 큰 수량이면 인정\)/,
  );
  assert.match(
    faq,
    /make one real B3TR → VOT3 conversion\. Any positive amount qualifies\./,
  );
  assert.match(
    social,
    /Make one real B3TR → VOT3 conversion after the first qualifying reward; any positive amount qualifies/,
  );
  assert.match(
    architecture,
    /makes one real B3TR → VOT3 conversion\. Any positive amount qualifies\./,
  );
  assert.match(
    readmeKo,
    /실제 B3TR → VOT3 전환 1회 검증 \(0보다 큰 수량이면 인정\)/,
  );
  assert.match(
    nextStepsKo,
    /실제 B3TR → VOT3 전환 1회 확인 \(0보다 큰 수량이면 인정\)/,
  );
});
