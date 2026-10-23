import test from 'node:test';
import assert from 'node:assert/strict';
import { PayPalError, isDefinitivePayPalRefundFailure } from '../src/Service/paypal.service.js';

test('classifies explicit PayPal refund rejections as definitive', () => {
  for (const status of [400, 401, 403, 404]) {
    assert.equal(isDefinitivePayPalRefundFailure(new PayPalError('rejected', { status })), true);
  }
});

test('keeps uncertain refund outcomes pending', () => {
  for (const status of [408, 409, 425, 429, 500, 502, 503]) {
    assert.equal(isDefinitivePayPalRefundFailure(new PayPalError('unknown outcome', { status })), false);
  }
  assert.equal(isDefinitivePayPalRefundFailure(new Error('socket timeout')), false);
  assert.equal(isDefinitivePayPalRefundFailure(new PayPalError('already processed', {
    status: 400, name: 'REFUND_ALREADY_PROCESSED',
  })), false);
});
