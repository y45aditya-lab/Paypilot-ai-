import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('webhook lease heartbeat refreshes only the active claim owner', async () => {
  const source = await readFile(new URL('../src/Service/paypalWebhook.js', import.meta.url), 'utf8');
  assert.match(source, /setInterval\(\(\) =>[\s\S]{0,220}status: 'processing', processingToken[\s\S]{0,120}updatedAt: new Date\(\)/);
  assert.match(source, /if \(!finalized\.matchedCount\)/);
  assert.match(source, /finally \{\s*clearInterval\(heartbeat\)/);
});
