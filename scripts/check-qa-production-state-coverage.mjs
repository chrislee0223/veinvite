import fs from 'node:fs';

const registry = fs.readFileSync('src/qa/stateRegistry.ts', 'utf8');
const directCoverage = fs.readFileSync('src/qa/directStateCoverage.ts', 'utf8');

const stateBlocks = [
  ...registry.matchAll(/knownState\(\{([\s\S]*?)\}\),/g),
].map((match) => match[1]);

const directIds = new Set(
  [...directCoverage.matchAll(/stateId: '([^']+)'/g)].map((match) => match[1]),
);

const productionVisible = [];
for (const block of stateBlocks) {
  const id = block.match(/\bid: '([^']+)'/)?.[1];
  if (!id) continue;
  const production = /\blifecycle: 'production'/.test(block);
  const userVisible = /\buserVisible: true/.test(block);
  if (production && userVisible) productionVisible.push(id);
}

const missing = productionVisible.filter((id) => !directIds.has(id));
if (missing.length > 0) {
  throw new Error(
    `Every current Production user-visible VeInvite UI state must have a direct QA renderer. Missing: ${missing.join(', ')}`,
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
  `Production QA state coverage gate passed: ${productionVisible.length}/${productionVisible.length} current user-visible states have direct renderers.`,
);
