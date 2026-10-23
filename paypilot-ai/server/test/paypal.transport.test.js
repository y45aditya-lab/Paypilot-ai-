import test from 'node:test';
import assert from 'node:assert/strict';

process.env.PAYPAL_BASE_URL = 'https://paypal.test.invalid';
process.env.PAYPAL_CLIENT_ID = 'test-client-id';
process.env.PAYPAL_CLIENT_SECRET = 'test-client-secret';

const paypal = await import('../src/Service/paypal.service.js');

test('capture requests reuse a stable idempotency key and preserve ambiguous provider errors', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || 'GET', headers: init.headers || {}, body: init.body });
    if (String(url).endsWith('/v1/oauth2/token')) {
      return new Response(JSON.stringify({ access_token: 'unit-test-token', expires_in: 3600 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (String(url).endsWith('/v2/checkout/orders/order-test-123/capture')) {
      return new Response(JSON.stringify({ name: 'INTERNAL_SERVER_ERROR', message: 'simulated provider failure' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (String(url).endsWith('/v2/checkout/orders/order-test-123')) {
      return new Response(JSON.stringify({ id: 'order-test-123', status: 'APPROVED' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    throw new Error(`Unexpected mocked PayPal request: ${url}`);
  };

  try {
    await assert.rejects(
      paypal.capturePayPalOrder({ paypalOrderId: 'order-test-123', orderId: 'paypilot-order-42' }),
      (error) => {
        assert.equal(error.status, 500);
        assert.equal(paypal.isDefinitivePayPalFailure(error), false);
        return true;
      },
    );
    const firstCapture = calls.find((call) => call.url.endsWith('/v2/checkout/orders/order-test-123/capture'));
    assert.ok(firstCapture);
    assert.equal(firstCapture.headers['PayPal-Request-Id'], 'capture-paypilot-order-42');

    const order = await paypal.getPayPalOrder('order-test-123');
    assert.equal(order.status, 'APPROVED');
    const getCall = calls.find((call) => call.url.endsWith('/v2/checkout/orders/order-test-123'));
    assert.equal(getCall.method, 'GET');
    assert.equal(getCall.body, undefined);

    // Repeating the same logical capture uses the same idempotency key.
    await assert.rejects(
      paypal.capturePayPalOrder({ paypalOrderId: 'order-test-123', orderId: 'paypilot-order-42' }),
      (error) => error.status === 500 && !paypal.isDefinitivePayPalFailure(error),
    );
    const captureCalls = calls.filter((call) => call.url.endsWith('/v2/checkout/orders/order-test-123/capture'));
    assert.equal(captureCalls.length, 2);
    assert.equal(captureCalls[0].headers['PayPal-Request-Id'], captureCalls[1].headers['PayPal-Request-Id']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('PayPal refund retries use a stable transaction-specific idempotency key', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || 'GET', headers: init.headers || {}, body: init.body });
    if (String(url).endsWith('/v2/payments/captures/capture-test-123/refund')) {
      return new Response(JSON.stringify({ id: 'refund-test-123', status: 'PENDING' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      });
    }
    throw new Error(`Unexpected mocked PayPal request: ${url}`);
  };

  try {
    await paypal.refundPayPalCapture({ captureId: 'capture-test-123', transactionId: 'transaction-88' });
    await paypal.refundPayPalCapture({ captureId: 'capture-test-123', transactionId: 'transaction-88' });
    assert.equal(calls.length, 2);
    assert.equal(calls[0].headers['PayPal-Request-Id'], 'refund-transaction-88');
    assert.equal(calls[1].headers['PayPal-Request-Id'], 'refund-transaction-88');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
