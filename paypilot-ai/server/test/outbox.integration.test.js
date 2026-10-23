import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import OutboxEvent from '../src/models/OutboxEvent.js';
import { enqueueOutboxEvent, processOutboxBatch } from '../src/Service/outbox.js';

const baseUri = process.env.TEST_MONGODB_URI;
const uri = baseUri ? (() => {
  const parsed = new URL(baseUri);
  parsed.pathname = `/paypilot_outbox_it_${process.pid}`;
  return parsed.toString();
})() : null;

test('outbox enqueue, retry, and dead-letter behavior', { skip: !uri }, async (t) => {
  await mongoose.connect(uri);
  await OutboxEvent.init();
  const prefix = `outbox-it-${process.pid}-${Date.now()}`;
  try {
    await t.test('enqueue is idempotent by eventKey', async () => {
      const eventKey = `${prefix}-idempotent`;
      const payload = { userId: new mongoose.Types.ObjectId().toString(), dedupeKey: eventKey };
      const first = await enqueueOutboxEvent({ eventKey, eventType: 'payment_notification', payload });
      const second = await enqueueOutboxEvent({ eventKey, eventType: 'payment_notification', payload });
      assert.equal(String(first._id), String(second._id));
      assert.equal(await OutboxEvent.countDocuments({ eventKey }), 1);
    });

    await t.test('failed processing schedules a bounded retry', async () => {
      const eventKey = `${prefix}-retry`;
      await OutboxEvent.create({
        eventKey,
        eventType: 'unsupported-integration-test-event',
        payload: {},
        status: 'pending',
        availableAt: new Date(Date.now() - 1000),
      });
      const [first, second] = await Promise.all([processOutboxBatch(), processOutboxBatch()]);
      const saved = await OutboxEvent.findOne({ eventKey }).lean();
      assert.equal(saved.attempts, 1, 'competing batches must not both claim the same event');
      assert.equal(saved.status, 'pending');
      assert.ok(saved.availableAt > new Date(), 'retry should be delayed by backoff');
      assert.equal(first.processed + second.processed, 0);
    });

    await t.test('exhausted events move to dead and are no longer eligible for retry', async () => {
      const eventKey = `${prefix}-dead`;
      await OutboxEvent.create({
        eventKey,
        eventType: 'unsupported-integration-test-event',
        payload: {},
        status: 'pending',
        attempts: 11,
        availableAt: new Date(Date.now() - 1000),
      });
      await processOutboxBatch();
      const saved = await OutboxEvent.findOne({ eventKey }).lean();
      assert.equal(saved.attempts, 12);
      assert.equal(saved.status, 'dead');
      await processOutboxBatch();
      const unchanged = await OutboxEvent.findOne({ eventKey }).lean();
      assert.equal(unchanged.attempts, 12);
      assert.equal(unchanged.status, 'dead');
    });
  } finally {
    await OutboxEvent.deleteMany({ eventKey: { $regex: `^${prefix}` } });
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
