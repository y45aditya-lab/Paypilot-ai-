import test from 'node:test';
import assert from 'node:assert/strict';
import { completedCapture } from '../src/Service/paymentReconciliation.js';
import { isExactFullRefund } from '../src/Service/refundReconciliation.js';

test('payment reconciliation selects only a completed capture', () => {
  assert.equal(completedCapture(null), null);
  assert.equal(completedCapture({ status: 'COMPLETED', purchase_units: [] }), null);
  assert.equal(completedCapture({
    purchase_units: [
      { payments: { captures: [{ id: 'pending-1', status: 'PENDING' }] } },
      { payments: { captures: [{ id: 'completed-2', status: 'COMPLETED' }] } },
    ],
  }).id, 'completed-2');
});

test('payment reconciliation ignores non-completed captures even when a unit has several', () => {
  assert.equal(completedCapture({
    purchase_units: [
      { payments: { captures: [{ id: 'denied-1', status: 'DENIED' }, { id: 'pending-2', status: 'PENDING' }] } },
    ],
  }), null);
});

test('refund reconciliation requires exact full amount and currency', () => {
  const transaction = { amountCents: 4999, currency: 'USD' };
  assert.equal(isExactFullRefund(transaction, { amount: { value: '49.99', currency_code: 'USD' } }), true);
  assert.equal(isExactFullRefund(transaction, { amount: { value: '49.98', currency_code: 'USD' } }), false);
  assert.equal(isExactFullRefund(transaction, { amount: { value: '49.99', currency_code: 'EUR' } }), false);
  assert.equal(isExactFullRefund(transaction, { amount: { value: '49.99', currency_code: 'USD' }, status: 'COMPLETED' }), true);
  assert.equal(isExactFullRefund(transaction, { amount: { value: 'unknown', currency_code: 'USD' } }), false);
});
