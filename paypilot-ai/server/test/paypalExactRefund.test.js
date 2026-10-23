import test from 'node:test';
import assert from 'node:assert/strict';
import { isExactPayPalRefund } from '../src/Service/paypal.service.js';

test('accepts only an exact full refund with matching currency', () => {
  assert.equal(isExactPayPalRefund({
    status: 'COMPLETED',
    amount: { value: '12.34', currency_code: 'USD' },
  }, 1234, 'USD'), true);
});

test('rejects partial, missing, malformed, or wrong-currency refund amounts', () => {
  const invalid = [
    null,
    { amount: { value: '12.33', currency_code: 'USD' } },
    { amount: { value: '12.34', currency_code: 'EUR' } },
    { amount: { value: '12.345', currency_code: 'USD' } },
    { amount: { currency_code: 'USD' } },
    { amount: { value: '12.34' } },
  ];
  for (const refund of invalid) {
    assert.equal(isExactPayPalRefund(refund, 1234, 'USD'), false);
  }
});
