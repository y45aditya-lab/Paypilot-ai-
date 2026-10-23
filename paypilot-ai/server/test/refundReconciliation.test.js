import test from 'node:test';
import assert from 'node:assert/strict';
import { isExactFullRefund } from '../src/Service/refundReconciliation.js';

const transaction = { amountCents: 1234, currency: 'USD' };

test('accepts a full refund only when exact amount and currency match', () => {
  assert.equal(isExactFullRefund(transaction, {
    status: 'COMPLETED',
    amount: { value: '12.34', currency_code: 'USD' },
  }), true);
});

test('rejects missing, partial, malformed, or wrong-currency refund amounts', () => {
  const invalid = [
    null,
    { amount: { value: '12.33', currency_code: 'USD' } },
    { amount: { value: '12.34', currency_code: 'EUR' } },
    { amount: { value: '12.345', currency_code: 'USD' } },
    { amount: { currency_code: 'USD' } },
    { amount: { value: '12.34' } },
  ];
  for (const refund of invalid) {
    assert.equal(isExactFullRefund(transaction, refund), false);
  }
});
