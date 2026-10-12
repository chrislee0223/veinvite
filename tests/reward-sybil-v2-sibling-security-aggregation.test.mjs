import assert from 'node:assert/strict';
import test from 'node:test';

import {
  distinctSiblingSecuritySignals,
  siblingSecuritySignals,
} from '../src/lib/sybil/v2/sameInviterSiblingSignals.ts';

test('later rapid sibling evidence is retained after an earlier generic match', () => {
  const gathered = [
    ...siblingSecuritySignals('client-a', false),
    ...siblingSecuritySignals('client-a', true),
    ...siblingSecuritySignals('client-a', false),
  ];
  const signals = distinctSiblingSecuritySignals(gathered);
  assert.deepEqual(
    signals.map(({ code }) => code).sort(),
    [
      'SECURITY_CLIENT_SIBLING_IMMEDIATE_SWITCH',
      'SECURITY_CLIENT_SIBLING_LINK',
    ],
  );
  assert.equal(signals.filter((s) => s.family === 'SECURITY_IDENTITY').length, 2);
  assert.equal(signals.find((s) => s.strength === 'HIGH')?.score, 100);
});

test('different clients remain separately auditable without counting duplicates on each one', () => {
  const signals = distinctSiblingSecuritySignals([
    ...siblingSecuritySignals('client-a', true),
    ...siblingSecuritySignals('client-b', false),
    ...siblingSecuritySignals('client-b', false),
  ]);
  assert.equal(signals.length, 3);
  assert.deepEqual(
    new Set(signals.map((signal) => signal.independentKey)),
    new Set(['client-a', 'client-b']),
  );
  assert.ok(signals.every((signal) => signal.family === 'SECURITY_IDENTITY'));
  assert.ok(signals.every((signal) => signal.score <= 100));
});

test('same-client link remains review evidence, not an automatic blacklist', () => {
  const signals = siblingSecuritySignals('shared-family-device', false);
  assert.equal(signals.length, 1);
  assert.equal(signals[0].strength, 'MEDIUM');
  assert.equal(signals[0].score, 60);
  assert.equal(signals[0].code, 'SECURITY_CLIENT_SIBLING_LINK');
});
