import test from 'node:test';
import assert from 'node:assert/strict';
import Order from '../src/models/Order.js';
import { reconcileOne } from '../src/Service/paymentReconciliation.js';

function makeOrder(overrides = {}) {
  return {
    _id: 'order-123',
    paypalOrderId: 'PAYPAL-ORDER-123',
    status: 'capturing',
    reconciliationLeaseToken: 'lease-token-current',
    ...overrides,
  };
}

async function withUpdateOneMock(run) {
  const original = Order.updateOne;
  const calls = [];
  Order.updateOne = async (...args) => {
    calls.push(args);
    return { acknowledged: true, matchedCount: 1 };
  };
  try {
    await run(calls);
  } finally {
    Order.updateOne = original;
  }
}

test('reconciles a completed provider capture and releases only its own lease', async () => {
  await withUpdateOneMock(async (updates) => {
    const order = makeOrder();
    const capture = { id: 'CAPTURE-123', status: 'COMPLETED' };
    let recorded;
    await reconcileOne(order, {
      getPayPalOrder: async (id) => {
        assert.equal(id, order.paypalOrderId);
        return { status: 'COMPLETED', purchase_units: [{ payments: { captures: [capture] } }] };
      },
      recordCompletedCapture: async (...args) => {
        recorded = args;
        return { ok: true };
      },
    });
    assert.deepEqual(recorded, [order, capture, 'reconciliation']);
    assert.equal(updates.length, 1);
    assert.deepEqual(updates[0][0], { _id: order._id, reconciliationLeaseToken: 'lease-token-current' });
    assert.deepEqual(updates[0][1], { $unset: { reconciliationLeaseUntil: 1, reconciliationLeaseToken: 1 } });
  });
});

test('keeps an approved order in capturing when capture outcome is ambiguous', async () => {
  await withUpdateOneMock(async (updates) => {
    const order = makeOrder();
    const ambiguousError = new Error('network timeout after request');
    let captureCalls = 0;
    await reconcileOne(order, {
      getPayPalOrder: async () => ({ status: 'APPROVED', purchase_units: [] }),
      capturePayPalOrder: async ({ paypalOrderId, orderId }) => {
        captureCalls += 1;
        assert.equal(paypalOrderId, order.paypalOrderId);
        assert.equal(orderId, order._id);
        throw ambiguousError;
      },
      isDefinitivePayPalFailure: () => false,
      recordCompletedCapture: async () => assert.fail('must not record an unknown capture'),
    });
    assert.equal(captureCalls, 1);
    assert.equal(updates.length, 1, 'ambiguous result must not mark the order failed or reset it');
    assert.deepEqual(updates[0][0], { _id: order._id, reconciliationLeaseToken: 'lease-token-current' });
  });
});

test('returns an approved order to payment_created only for a definitive capture failure', async () => {
  await withUpdateOneMock(async (updates) => {
    const order = makeOrder();
    await reconcileOne(order, {
      getPayPalOrder: async () => ({ status: 'APPROVED', purchase_units: [] }),
      capturePayPalOrder: async () => { throw new Error('capture definitively rejected'); },
      isDefinitivePayPalFailure: () => true,
    });
    assert.equal(updates.length, 2);
    assert.deepEqual(updates[0][0], { _id: order._id, status: 'capturing' });
    assert.deepEqual(updates[0][1], { status: 'payment_created' });
    assert.deepEqual(updates[1][0], { _id: order._id, reconciliationLeaseToken: 'lease-token-current' });
  });
});

test('does not change payment state when the provider lookup fails, but releases its lease', async () => {
  await withUpdateOneMock(async (updates) => {
    const order = makeOrder();
    await reconcileOne(order, {
      getPayPalOrder: async () => { throw new Error('provider unavailable'); },
    });
    assert.equal(updates.length, 1);
    assert.deepEqual(updates[0][0], { _id: order._id, reconciliationLeaseToken: 'lease-token-current' });
    assert.deepEqual(updates[0][1], { $unset: { reconciliationLeaseUntil: 1, reconciliationLeaseToken: 1 } });
  });
});
