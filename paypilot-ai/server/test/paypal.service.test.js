import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PayPalError,
  centsToPayPalValue,
  payPalValueToCents,
  isExactPayPalRefund,
  isDefinitivePayPalFailure,
  isDefinitivePayPalRefundFailure,
} from '../src/Service/paypal.service.js';

test('PayPal amount conversion uses exact integer cents', () => {
  assert.equal(centsToPayPalValue(0), '0.00');
  assert.equal(centsToPayPalValue(1), '0.01');
  assert.equal(centsToPayPalValue(4999), '49.99');
  assert.equal(centsToPayPalValue(100000), '1000.00');
  assert.equal(payPalValueToCents('0'), 0);
  assert.equal(payPalValueToCents('0.1'), 10);
  assert.equal(payPalValueToCents('49.99'), 4999);
  assert.equal(payPalValueToCents('1000.00'), 100000);
  assert.ok(Number.isNaN(payPalValueToCents('-1.00')));
  assert.ok(Number.isNaN(payPalValueToCents('01.00')));
  assert.ok(Number.isNaN(payPalValueToCents('1.001')));
  assert.throws(() => centsToPayPalValue(-1), RangeError);
  assert.throws(() => centsToPayPalValue(1.5), RangeError);
});

test('refund verification requires exact amount and currency', () => {
  assert.equal(isExactPayPalRefund({ amount: { value: '49.99', currency_code: 'USD' } }, 4999, 'USD'), true);
  assert.equal(isExactPayPalRefund({ amount: { value: '49.98', currency_code: 'USD' } }, 4999, 'USD'), false);
  assert.equal(isExactPayPalRefund({ amount: { value: '49.99', currency_code: 'EUR' } }, 4999, 'USD'), false);
  assert.equal(isExactPayPalRefund({ amount: { value: 'invalid', currency_code: 'USD' } }, 4999, 'USD'), false);
});

test('capture failure classification keeps ambiguous outcomes retry-safe', () => {
  assert.equal(isDefinitivePayPalFailure(new PayPalError('declined', { status: 422, name: 'INSTRUMENT_DECLINED' })), true);
  assert.equal(isDefinitivePayPalFailure(new PayPalError('not approved', { status: 422, name: 'ORDER_NOT_APPROVED' })), true);
  assert.equal(isDefinitivePayPalFailure(new PayPalError('conflict', { status: 409, name: 'ORDER_ALREADY_CAPTURED' })), false);
  assert.equal(isDefinitivePayPalFailure(new PayPalError('server error', { status: 500, name: 'INTERNAL_SERVER_ERROR' })), false);
  assert.equal(isDefinitivePayPalFailure(new Error('socket timeout')), false);
});

test('refund failure classification treats uncertain responses as pending', () => {
  assert.equal(isDefinitivePayPalRefundFailure(new PayPalError('invalid request', { status: 400, name: 'INVALID_REQUEST' })), true);
  assert.equal(isDefinitivePayPalRefundFailure(new PayPalError('server error', { status: 500, name: 'INTERNAL_SERVER_ERROR' })), false);
  assert.equal(isDefinitivePayPalRefundFailure(new PayPalError('already processed', { status: 400, name: 'REFUND_ALREADY_PROCESSED' })), false);
  assert.equal(isDefinitivePayPalRefundFailure(new Error('socket timeout')), false);
});
