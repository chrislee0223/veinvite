import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const client = fs.readFileSync('src/instrumentation-client.ts', 'utf8');
const server = fs.readFileSync('sentry.server.config.ts', 'utf8');
const edge = fs.readFileSync('sentry.edge.config.ts', 'utf8');
const redaction = fs.readFileSync('src/lib/sentryRedaction.ts', 'utf8');

test('Sentry never opts into default PII collection', () => {
  for (const config of [client, server, edge]) {
    assert.match(config, /sendDefaultPii:\s*false/);
  }
});

test('client replay only records sessions when an error happens', () => {
  assert.match(client, /replaysSessionSampleRate:\s*0/);
  assert.match(client, /replaysOnErrorSampleRate:\s*1/);
  assert.match(client, /maskAllText:\s*true/);
  assert.match(client, /blockAllMedia:\s*true/);
});

test('wallet addresses and invite-like query values are redacted', () => {
  assert.match(redaction, /0x\[a-fA-F0-9\]\{40\}/);
  assert.match(redaction, /inviteCode/);
  assert.match(redaction, /\[wallet\]/);
  assert.match(redaction, /\[redacted\]/);
});
