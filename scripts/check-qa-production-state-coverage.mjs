import fs from 'node:fs';

const registry = fs.readFileSync('src/qa/stateRegistry.ts', 'utf8');
const directCoverage = fs.readFileSync('src/qa/directStateCoverage.ts', 'utf8');

const stateBlocks = [
  ...registry.matchAll(/knownState\(\{([\s\S]*?)\}\),/g),
].map((match) => match[1]);

const directIds = new Set(
  [...directCoverage.matchAll(/stateId: '([^']+)'/g)].map((match) => match[1]),
);

// This state is only reachable through the old demo-only mission completion
// button guarded by NEXT_PUBLIC_DEMO_MODE. It is kept in the inventory for
// historical/debugging reference, but it is not part of normal Production or
// reachable legacy-user UI coverage.
const NON_PRODUCTION_VISIBLE_EXCEPTIONS = new Set([
  'LEG-ERROR-COMPLETE',
]);

const productionVisible = [];
const legacyVisible = [];
for (const block of stateBlocks) {
  const id = block.match(/\bid: '([^']+)'/)?.[1];
  if (!id) continue;
  const production = /\blifecycle: 'production'/.test(block);
  const legacy = /\blifecycle: 'legacy'/.test(block);
  const userVisible = /\buserVisible: true/.test(block);
  if (!userVisible || NON_PRODUCTION_VISIBLE_EXCEPTIONS.has(id)) continue;
  if (production) productionVisible.push(id);
  if (legacy) legacyVisible.push(id);
}

const requiredVisible = [...productionVisible, ...legacyVisible];
const missing = requiredVisible.filter((id) => !directIds.has(id));
if (missing.length > 0) {
  throw new Error(
    `Every current Production and reachable legacy user-visible VeInvite UI state must have a direct QA renderer. Missing: ${missing.join(', ')}`,
  );
}

const unknownDirect = [...directIds].filter(
  (id) => !stateBlocks.some((block) => block.includes(`id: '${id}'`)),
);
if (unknownDirect.length > 0) {
  throw new Error(
    `Direct QA renderers must reference inventoried states. Unknown: ${unknownDirect.join(', ')}`,
  );
}

console.log(
  `QA user-visible state coverage gate passed: ${productionVisible.length}/${productionVisible.length} Production and ${legacyVisible.length}/${legacyVisible.length} reachable legacy states have direct renderers.`,
);
