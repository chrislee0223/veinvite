import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectHighSeverityAudit } from '../scripts/check-dependency-security-audit.mjs';

const date = new Date('2026-11-18T00:00:00Z');
const picomatch = {
  name: 'picomatch',
  severity: 'high',
  fixAvailable: false,
  via: [{
    source: 123456,
    name: 'picomatch',
    severity: 'high',
    url: 'https://github.com/advisories/GHSA-fc5q-39xc-vjpf',
  }],
};
const report = (vulnerabilities, high, critical = 0) => ({
  metadata: { vulnerabilities: { high, critical, moderate: 3 } },
  vulnerabilities,
});

test('only a single directly identified unpatched picomatch advisory can propagate', () => {
  const finding = report({
    picomatch,
    '@rollup/pluginutils': { severity: 'high', via: ['picomatch'] },
    '@sentry/nextjs': { severity: 'high', via: ['@rollup/pluginutils'] },
    hono: { severity: 'moderate', via: [{ name: 'hono', severity: 'moderate' }] },
  }, 3);
  const result = inspectHighSeverityAudit(finding, date);
  assert.equal(result.ok, true);
  assert.equal(result.waived, true);
  assert.equal(result.highCount, 3);
});

test('unrelated high and all critical advisories remain blocking', () => {
  const unrelated = report({
    picomatch,
    vulnerableOther: { severity: 'high', via: [{ severity: 'high', url: 'https://github.com/advisories/GHSA-unknown' }] },
  }, 2);
  assert.equal(inspectHighSeverityAudit(unrelated, date).ok, false);
  assert.equal(inspectHighSeverityAudit(report({picomatch, criticalThing: {
    severity: 'critical', via: [{severity:'critical'}]
  }}, 1, 1), date).ok, false);
});

test('an official fix, expiration, malformed audit and inconsistent counts block', () => {
  const known = report({ picomatch }, 1);
  assert.equal(inspectHighSeverityAudit(known, new Date('2026-11-26T00:00:00Z')).ok, false);
  assert.equal(inspectHighSeverityAudit(report({
    picomatch: {...picomatch, fixAvailable: true}
  }, 1), date).ok, false);
  assert.equal(inspectHighSeverityAudit(report({
    picomatch: {...picomatch, fixAvailable: {
      name: '@sentry/nextjs', version: '8.38.0', isSemVerMajor: true
    }}
  }, 1), date).ok, true);
  assert.equal(inspectHighSeverityAudit(report({
    picomatch: {...picomatch, fixAvailable: {
      name: 'picomatch', version: '4.0.8', isSemVerMajor: false
    }}
  }, 1), date).ok, false);
  assert.equal(inspectHighSeverityAudit(report({picomatch}, 15), date).ok, false);
  assert.equal(inspectHighSeverityAudit(null, date).ok, false);
  assert.equal(inspectHighSeverityAudit(report({}, 0), date).ok, true);
});

test('high severity dependents must connect to approved leaf', () => {
  const brokenGraph = report({
    picomatch,
    unknownParent: {severity:'high', via:['missingPackage']},
  }, 2);
  assert.equal(inspectHighSeverityAudit(brokenGraph, date).ok, false);
  const cycle = report({
    picomatch,
    a: {severity:'high', via:['b']},
    b: {severity:'high', via:['a']},
  }, 3);
  assert.equal(inspectHighSeverityAudit(cycle, date).ok, false);
});
