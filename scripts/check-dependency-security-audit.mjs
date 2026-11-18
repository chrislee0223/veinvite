import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// This exception is restricted to a single published, currently unpatched
// upstream picomatch ReDoS advisory. It never disables npm audit, never waives
// an unrelated high or critical advisory, and fails closed after 2026-11-25.
// Remove this exception immediately after an upstream fixed release.
const ADVISORY = 'GHSA-fc5q-39xc-vjpf';
const EXPIRES_AFTER_UTC_DATE = '2026-11-25';

export function inspectHighSeverityAudit(report, date = new Date()) {
  if (!report || typeof report !== 'object' || !report.metadata?.vulnerabilities ||
      !report.vulnerabilities || typeof report.vulnerabilities !== 'object') {
    return { ok: false, reason: 'Missing or invalid npm audit data', highCount: null };
  }
  const all = report.vulnerabilities;
  const critical = Object.entries(all).filter(([, v]) => v.severity === 'critical').map(([n]) => n);
  if (critical.length) {
    return { ok: false, reason: 'Critical vulnerabilities are never exempt', blocked: critical };
  }

  const high = Object.entries(all).filter(([, v]) => v.severity === 'high').map(([n]) => n);
  const totalHigh = Number(report.metadata.vulnerabilities.high ?? 0);
  if (!Number.isInteger(totalHigh) || totalHigh !== high.length) {
    return { ok: false, reason: 'Cannot reconcile high severity count and dependency graph', blocked: high };
  }
  if (!high.length) return { ok: true, highCount: 0, waived: false };

  // No automatic acceptance if upstream has released a fix or the review
  // window has passed. Prevents a temporary exception from becoming permanent.
  if (date.toISOString().slice(0, 10) > EXPIRES_AFTER_UTC_DATE) {
    return { ok: false, reason: 'Picomatch review expired; upgrade or re-review', blocked: high };
  }
  const picomatch = all.picomatch;
  if (!picomatch || picomatch.severity !== 'high' || picomatch.fixAvailable !== false) {
    return { ok: false, reason: 'Picomatch no-fix prerequisite not met', blocked: high };
  }

  const memo = new Map();
  function onlyKnownNoFix(name, visiting = new Set()) {
    if (memo.has(name)) return memo.get(name);
    const entry = all[name];
    if (!entry || entry.severity !== 'high' || visiting.has(name) || !Array.isArray(entry.via)) return false;
    const nextVisited = new Set(visiting);
    nextVisited.add(name);
    let foundKnown = false;
    for (const via of entry.via) {
      if (typeof via === 'string') {
        const child = all[via];
        if (!child || !['high', 'critical'].includes(child.severity)) continue;
        if (!onlyKnownNoFix(via, nextVisited)) return false;
        foundKnown = true;
      } else if (via && typeof via === 'object' && ['high', 'critical'].includes(via.severity)) {
        if (name !== 'picomatch' || !String(via.url).includes(ADVISORY) || via.severity !== 'high') return false;
        foundKnown = true;
      }
    }
    memo.set(name, foundKnown);
    return foundKnown;
  }
  const blocked = high.filter(name => !onlyKnownNoFix(name));
  if (blocked.length) {
    return { ok: false, reason: 'Unreviewed high severity vulnerability detected', blocked, highCount: high.length };
  }
  return {
    ok: true,
    waived: true,
    advisory: ADVISORY,
    highCount: high.length,
    expiresAfterUtcDate: EXPIRES_AFTER_UTC_DATE,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let report;
  try {
    report = JSON.parse(readFileSync(process.argv[2] || '.ci/dependency-audit.json', 'utf8'));
  } catch (error) {
    console.error('npm audit JSON could not be read; fail closed:', String(error));
    process.exit(1);
  }
  const result = inspectHighSeverityAudit(report);
  if (!result.ok) {
    console.error('Dependency security gate blocked:', result);
    process.exit(1);
  }
  if (result.waived) {
    console.warn(
      `TEMPORARY UNPATCHED UPSTREAM CVE ONLY: ${result.advisory}; ${result.highCount} propagated high findings, strict deadline ${result.expiresAfterUtcDate}. Any new high/critical blocks. This is not remediation.`,
    );
  } else {
    console.log('Dependency security gate: zero high or critical vulnerabilities.');
  }
}
