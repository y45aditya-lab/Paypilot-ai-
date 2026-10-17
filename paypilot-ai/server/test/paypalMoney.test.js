import test from 'node:test';
import assert from 'node:assert/strict';
import { centsToPayPalValue, payPalValueToCents } from '../src/Service/paypal.service.js';

test('formats integer cents for PayPal without floating point arithmetic', () => {
  assert.equal(centsToPayPalValue(0), '0.00');
  assert.equal(centsToPayPalValue(5), '0.05');
  assert.equal(centsToPayPalValue(4999), '49.99');
  assert.throws(() => centsToPayPalValue(-1), RangeError);
  assert.throws(() => centsToPayPalValue(1.5), RangeError);
});

test('converts PayPal decimal amounts to integer cents', () => {
  assert.equal(payPalValueToCents('49.99'), 4999);
  assert.equal(payPalValueToCents('0.05'), 5);
  assert.equal(payPalValueToCents('10'), 1000);
  assert.ok(Number.isNaN(payPalValueToCents('1.005')));
  assert.ok(Number.isNaN(payPalValueToCents('90071992547409.92')));
});
