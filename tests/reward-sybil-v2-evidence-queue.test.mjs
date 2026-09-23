import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Sybil v2 evidence queue consumer is registered in Vercel', async () => {
  const config = JSON.parse(
    await readFile('vercel.json', 'utf8'),
  );

  const route =
    config.functions?.['src/app/api/queues/sybil-v2-evidence/route.ts'];

  assert.ok(route, 'missing Sybil v2 evidence queue function config');
  assert.ok(Array.isArray(route.experimentalTriggers));

  const trigger = route.experimentalTriggers.find(
    (candidate) =>
      candidate?.type === 'queue/v2beta' &&
      candidate?.topic === 'veinvite-sybil-v2-evidence',
  );

  assert.ok(
    trigger,
    'Sybil v2 evidence topic has no registered queue consumer',
  );
});

test('activation-time publisher and consumer use the same evidence topic', async () => {
  const publisher = await readFile(
    'src/lib/sybil/v2/evidenceQueue.ts',
    'utf8',
  );
  const consumer = await readFile(
    'src/app/api/queues/sybil-v2-evidence/route.ts',
    'utf8',
  );

  assert.match(
    publisher,
    /SYBIL_V2_EVIDENCE_TOPIC\s*=\s*['"]veinvite-sybil-v2-evidence['"]/u,
  );
  assert.match(
    consumer,
    /collectSybilV2EvidenceForInvite/u,
  );
  assert.match(
    consumer,
    /handleCallback/u,
  );
});

test('reconcile republishes unfinished Sybil v2 scan backlog into the queue', async () => {
  const queueSource = await readFile(
    'src/lib/sybil/v2/evidenceQueue.ts',
    'utf8',
  );
  const cronSource = await readFile(
    'src/app/api/cron/reconcile/route.ts',
    'utf8',
  );

  assert.match(
    queueSource,
    /operator_sybil_v2_scan_candidates/u,
  );
  assert.match(
    queueSource,
    /enqueueSybilV2EvidenceBacklogBatch/u,
  );
  assert.match(
    queueSource,
    /idempotencyKey:\s*\n?\s*`veinvite-sybil-v2-evidence-\$\{payload\.inviteCode\}`/u,
  );

  assert.match(
    cronSource,
    /enqueueSybilV2EvidenceBacklogBatch\(50\)/u,
  );
  assert.match(
    cronSource,
    /SYBIL_V2_EVIDENCE_QUEUE/u,
  );

  const directRecovery = cronSource.indexOf(
    'runSybilV2EvidenceCollectionBatch(4)',
  );
  const queueRecovery = cronSource.indexOf(
    'enqueueSybilV2EvidenceBacklogBatch(50)',
  );

  assert.ok(
    directRecovery >= 0 &&
      queueRecovery > directRecovery,
    'direct recovery should consume a few rows before backlog requeue to reduce duplicate workers',
  );
});

test('invite activation routes still publish Sybil v2 evidence immediately', async () => {
  const routes = [
    'src/app/api/invites/[code]/claim/route.ts',
    'src/app/api/referral-links/[key]/claim/route.ts',
  ];

  for (const route of routes) {
    const source = await readFile(route, 'utf8');

    assert.match(
      source,
      /enqueueSybilV2EvidenceCollection/u,
      `${route} no longer publishes activation evidence`,
    );
  }
});
