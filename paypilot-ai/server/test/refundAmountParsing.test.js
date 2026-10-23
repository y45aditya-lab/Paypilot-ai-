import test from 'node:test';
import assert from 'node:assert/strict';
import { payPalValueToCents } from '../src/Service/paypal.service.js';

test('parses PayPal refund amounts with exact integer-cent arithmetic', () => {
  assert.equal(payPalValueToCents('12.34'), 1234);
  assert.equal(payPalValueToCents('12'), 1200);
  assert.equal(payPalValueToCents('12.3'), 1230);
});

test('rejects malformed, negative, over-precision, and unsafe refund amounts', () => {
  for (const value of ['12.345', '-1.00', '01.00', 'abc', '9007199254740992.00']) {
    assert.equal(Number.isSafeInteger(payPalValueToCents(value)), false, value);
  }
});
