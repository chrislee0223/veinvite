import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(
  new URL('../src/lib/referralLinks.ts', import.meta.url),
  'utf8',
);

const match = source.match(/return \/(\^.*\$)\/\.test\(value\);/);
assert.ok(match, 'referral key validator regex must stay directly testable');
const validator = new RegExp(match[1]);

test('referral key validator accepts only new 16-char and legacy 22-64-char formats', () => {
  assert.equal(validator.test('A'.repeat(15)), false);
  assert.equal(validator.test('A'.repeat(16)), true);
  assert.equal(validator.test('A'.repeat(17)), false);
  assert.equal(validator.test('A'.repeat(21)), false);
  assert.equal(validator.test('A'.repeat(22)), true);
  assert.equal(validator.test('A'.repeat(32)), true);
  assert.equal(validator.test('A'.repeat(64)), true);
  assert.equal(validator.test('A'.repeat(65)), false);
  assert.equal(validator.test('A'.repeat(15) + '-'), true);
  assert.equal(validator.test('A'.repeat(15) + '_'), true);
  assert.equal(validator.test('A'.repeat(15) + '+'), false);
  assert.equal(validator.test('A'.repeat(15) + '/'), false);
});
