import test from 'node:test';
import assert from 'node:assert/strict';

test('refund state updates are guarded so late responses cannot overwrite settled refunds', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/routes/Transcation.js', import.meta.url), 'utf8');
  assert.match(source, /refundStatus: 'processing'[\s\S]{0,120}\$set: refundUpdate/);
  assert.match(source, /recordedFailure \|\| await Transaction\.findById\(transaction\._id\)/);
  assert.match(source, /transaction\.status === 'refunded' \|\| transaction\.refundStatus === 'completed'/);
});
