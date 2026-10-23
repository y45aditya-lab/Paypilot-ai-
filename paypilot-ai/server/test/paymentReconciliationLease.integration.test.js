import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Order from '../src/models/Order.js';

const configuredUri = process.env.TEST_MONGODB_URI;
const uri = configuredUri ? (() => {
  const parsed = new URL(configuredUri);
  parsed.pathname = `/paypilot_payment_lease_it_${process.pid}`;
  return parsed.toString();
})() : null;

test('payment reconciliation lease has one owner and fences expired workers', { skip: !uri }, async () => {
  await mongoose.connect(uri);
  await Order.init();

  const prefix = `payment-lease-it-${process.pid}-${Date.now()}`;
  const orderId = new mongoose.Types.ObjectId();
  const now = new Date();
  const staleBefore = new Date(now.getTime() - 3 * 60 * 1000);
  const leaseDurationMs = 10 * 60 * 1000;

  const claim = (token, claimTime = new Date()) => Order.findOneAndUpdate(
    {
      _id: orderId,
      status: 'capturing',
      paypalOrderId: { $type: 'string' },
      updatedAt: { $lt: new Date(claimTime.getTime() - 2 * 60 * 1000) },
      $or: [
        { reconciliationLeaseUntil: { $exists: false } },
        { reconciliationLeaseUntil: { $lt: claimTime } },
      ],
    },
    {
      $set: {
        reconciliationLeaseUntil: new Date(claimTime.getTime() + leaseDurationMs),
        reconciliationLeaseToken: token,
      },
      $inc: { reconciliationAttempts: 1 },
    },
    { new: true },
  );

  try {
    await Order.create({
      _id: orderId,
      organization: new mongoose.Types.ObjectId(),
      user: new mongoose.Types.ObjectId(),
      product: new mongoose.Types.ObjectId(),
      productName: 'Lease test product',
      category: 'Software',
      seats: 1,
      unitPriceCents: 4999,
      totalCents: 4999,
      currency: 'USD',
      status: 'capturing',
      paypalOrderId: `${prefix}-paypal-order`,
      updatedAt: staleBefore,
    });
    await Order.updateOne({ _id: orderId }, { $set: { updatedAt: staleBefore } }, { timestamps: false });

    const [workerA, workerB] = await Promise.all([
      claim('worker-a', now),
      claim('worker-b', now),
    ]);
    assert.equal([workerA, workerB].filter(Boolean).length, 1);
    const originalOwner = workerA ? 'worker-a' : 'worker-b';

    // Simulate expiry and a later reclaim. The replacement owner gets a new token.
    const expiredAt = new Date(now.getTime() + leaseDurationMs + 1000);
    await Order.updateOne(
      { _id: orderId },
      { $set: {
        updatedAt: new Date(expiredAt.getTime() - 3 * 60 * 1000),
        reconciliationLeaseUntil: new Date(expiredAt.getTime() - 1000),
      } },
      { timestamps: false },
    );
    const replacement = await claim('worker-c', expiredAt);
    assert.ok(replacement);
    assert.equal(replacement.reconciliationLeaseToken, 'worker-c');

    // The old worker's token cannot clear the replacement's lease.
    const staleRelease = await Order.updateOne(
      { _id: orderId, reconciliationLeaseToken: originalOwner },
      { $unset: { reconciliationLeaseUntil: 1, reconciliationLeaseToken: 1 } },
    );
    assert.equal(staleRelease.matchedCount, 0);

    const current = await Order.findById(orderId).lean();
    assert.equal(current.reconciliationLeaseToken, 'worker-c');
    assert.ok(current.reconciliationLeaseUntil > expiredAt);
    assert.equal(current.reconciliationAttempts, 2);
  } finally {
    await Order.deleteOne({ _id: orderId });
    await mongoose.disconnect();
  }
});
