import test from 'node:test';
import assert from 'node:assert/strict';
import { PayPalError, isDefinitivePayPalFailure } from '../src/Service/paypal.service.js';

test('recognizes only whitelisted definitive PayPal rejections', () => {
  assert.equal(isDefinitivePayPalFailure(new PayPalError('declined', {
    status: 422, name: 'INSTRUMENT_DECLINED',
  })), true);
  assert.equal(isDefinitivePayPalFailure(new PayPalError('not approved', {
    status: 422, name: 'ORDER_NOT_APPROVED',
  })), true);
  assert.equal(isDefinitivePayPalFailure(new PayPalError('unauthorized', {
    status: 401,
  })), true);
  assert.equal(isDefinitivePayPalFailure(new PayPalError('bad request', {
    status: 400, name: 'ORDER_ALREADY_CAPTURED',
  })), false);
});

test('keeps ambiguous provider and network failures pending', () => {
  for (const status of [408, 409, 425, 429, 500, 502, 503]) {
    assert.equal(isDefinitivePayPalFailure(new PayPalError('provider error', { status })), false);
  }
  assert.equal(isDefinitivePayPalFailure(new Error('socket timeout')), false);
});
