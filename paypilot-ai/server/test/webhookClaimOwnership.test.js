import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('webhook finalization is scoped to the current processing token', async () => {
  const source = await readFile(new URL('../src/Service/paypalWebhook.js', import.meta.url), 'utf8');
  assert.match(source, /const processingToken = randomUUID\(\)/);
  assert.match(source, /eventId: event\.id, status: 'processing', processingToken/);
  assert.match(source, /status: outcome === 'ignored' \? 'ignored' : 'processed', processingToken: null/);
  assert.match(source, /status: 'failed', error: String\(err\.message\)\.slice\(0, 200\), processingToken: null/);
});
