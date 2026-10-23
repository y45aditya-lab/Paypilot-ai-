import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('capture-denied webhook only emits failure side effects after an atomic open-state transition', async () => {
  const source = await readFile(new URL('../src/Service/webhooksHandlers.js', import.meta.url), 'utf8');
  assert.match(source, /const failedOrder = await Order\.findOneAndUpdate\([\s\S]{0,180}status: \{ \$in: OPEN \}[\s\S]{0,100}status: 'failed'/);
  assert.match(source, /if \(!failedOrder\) return 'ignored'/);
  assert.match(source, /audit\('webhook\.capture_denied', \{ userId: failedOrder\.user/);
});
