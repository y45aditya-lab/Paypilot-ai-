import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import OutboxEvent from '../src/models/OutboxEvent.js';
import Notification from '../src/models/Notification.js';
import User from '../src/models/User.js';
import { processOutboxBatch } from '../src/Service/outbox.js';

const baseUri = process.env.TEST_MONGODB_URI;
const uri = baseUri ? (() => {
  const parsed = new URL(baseUri);
  parsed.pathname = `/paypilot_outbox_delivery_it_${process.pid}`;
  return parsed.toString();
})() : null;

test('outbox delivery persists one notification and recovers after a worker interruption', { skip: !uri }, async () => {
  await mongoose.connect(uri);
  await Promise.all([OutboxEvent.init(), Notification.init(), User.init()]);
  const prefix = `outbox-delivery-it-${process.pid}-${Date.now()}`;
  const organization = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();
  const orderId = new mongoose.Types.ObjectId();
  const transactionId = new mongoose.Types.ObjectId();
  const dedupeKey = `${prefix}-payment-completed`;

  try {
    await User.create({
      _id: userId,
      name: 'Outbox Integration Test',
      email: `${prefix}@example.invalid`,
      passwordHash: 'test-only-not-a-real-password-hash',
      organization,
      notificationPreferences: { payment: true, email: false },
    });

    await OutboxEvent.create({
      eventKey: `${prefix}-first`,
      eventType: 'payment_notification',
      payload: {
        userId: String(userId),
        organizationId: String(organization),
        type: 'payment_completed',
        title: 'Payment confirmed',
        message: 'Test payment notification',
        orderId: String(orderId),
        transactionId: String(transactionId),
        dedupeKey,
      },
      status: 'pending',
      availableAt: new Date(Date.now() - 1000),
    });

    const firstRun = await processOutboxBatch();
    assert.equal(firstRun.processed, 1);
    assert.equal(await Notification.countDocuments({ dedupeKey }), 1);

    // Model the crash window: notification was persisted, but the worker did
    // not get to mark its event processed. The lease is now expired.
    const recoveryKey = `${prefix}-recovery`;
    const recoveryDedupeKey = `${prefix}-recovery-notification`;
    await Notification.create({
      organization,
      user: userId,
      type: 'payment_completed',
      title: 'Payment confirmed',
      message: 'Previously persisted before simulated worker interruption',
      order: orderId,
      transaction: transactionId,
      dedupeKey: recoveryDedupeKey,
    });
    await OutboxEvent.create({
      eventKey: recoveryKey,
      eventType: 'payment_notification',
      payload: {
        userId: String(userId),
        organizationId: String(organization),
        type: 'payment_completed',
        title: 'Payment confirmed',
        message: 'Previously persisted before simulated worker interruption',
        orderId: String(orderId),
        transactionId: String(transactionId),
        dedupeKey: recoveryDedupeKey,
      },
      status: 'processing',
      attempts: 1,
      processingToken: 'expired-worker-token',
      availableAt: new Date(Date.now() - 5 * 60 * 1000),
      createdAt: new Date(Date.now() - 5 * 60 * 1000),
      updatedAt: new Date(Date.now() - 5 * 60 * 1000),
    });
    // Explicitly age the lease after insert; Mongoose timestamps can replace
    // caller-provided updatedAt during document creation.
    await OutboxEvent.updateOne(
      { eventKey: recoveryKey },
      { $set: { updatedAt: new Date(Date.now() - 5 * 60 * 1000) } },
      { timestamps: false },
    );

    await processOutboxBatch();
    const recoveredEvent = await OutboxEvent.findOne({ eventKey: recoveryKey }).lean();
    assert.equal(recoveredEvent.status, 'processed');
    assert.equal(await Notification.countDocuments({ dedupeKey: recoveryDedupeKey }), 1);

    // Reprocessing the completed event cannot produce another notification.
    await processOutboxBatch();
    assert.equal(await Notification.countDocuments({ dedupeKey }), 1);
    assert.equal(await Notification.countDocuments({ dedupeKey: recoveryDedupeKey }), 1);
  } finally {
    await OutboxEvent.deleteMany({ eventKey: { $regex: `^${prefix}` } });
    await Notification.deleteMany({ dedupeKey: { $regex: `^${prefix}` } });
    await User.deleteOne({ _id: userId });
    await mongoose.disconnect();
  }
});
