import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(
  new URL('../src/lib/rewards/allocationAccounting.ts', import.meta.url),
  'utf8',
);

test('allocation receipts are scanned and checkpointed only through finalized head', () => {
  const finalizedReads = source.match(
    /getBlockCompressed\(['"]finalized['"]\)/g,
  ) ?? [];

  assert.ok(
    finalizedReads.length >= 2,
    'both direct evidence reads and scheduled allocation sync must use finalized head',
  );
  assert.doesNotMatch(source, /getBestBlockCompressed\(/);
  assert.match(source, /toBlock:\s*finalizedBlockNumber/);
  assert.match(
    source,
    /saveAllocationScanCheckpoint\(network, finalizedBlockNumber\)/,
  );
  assert.match(source, /scannedToBlock:\s*finalizedBlockNumber/);
});
