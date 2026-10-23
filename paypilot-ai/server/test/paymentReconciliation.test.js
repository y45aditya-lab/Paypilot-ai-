import test from 'node:test';
import assert from 'node:assert/strict';
import { completedCapture } from '../src/Service/paymentReconciliation.js';

test('finds a completed capture across purchase units', () => {
  const capture = { id: 'CAP-123', status: 'COMPLETED' };
  const result = completedCapture({
    purchase_units: [
      { payments: { captures: [{ id: 'CAP-PENDING', status: 'PENDING' }] } },
      { payments: { captures: [capture] } },
    ],
  });
  assert.deepEqual(result, capture);
});

test('does not treat pending, denied, or missing captures as completed', () => {
  assert.equal(completedCapture({
    purchase_units: [{ payments: { captures: [
      { id: 'CAP-PENDING', status: 'PENDING' },
      { id: 'CAP-DENIED', status: 'DENIED' },
    ] } }],
  }), null);
  assert.equal(completedCapture({ purchase_units: [] }), null);
  assert.equal(completedCapture(null), null);
});
