import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import OutboxEvent from '../src/models/OutboxEvent.js';
import { enqueueOutboxEvent } from '../src/Service/outbox.js';

const uri = process.env.TEST_MONGODB_URI;

test('outbox enqueue is idempotent by eventKey', { skip: !uri }, async () => {
  await mongoose.connect(uri);
  await OutboxEvent.init();
  const eventKey = `outbox-it-${process.pid}-${Date.now()}`;
  try {
    const payload = { userId: new mongoose.Types.ObjectId().toString(), dedupeKey: eventKey };
    const first = await enqueueOutboxEvent({ eventKey, eventType: 'payment_notification', payload });
    const second = await enqueueOutboxEvent({ eventKey, eventType: 'payment_notification', payload });
    assert.equal(String(first._id), String(second._id));
    assert.equal(await OutboxEvent.countDocuments({ eventKey }), 1);
  } finally {
    await OutboxEvent.deleteMany({ eventKey });
    await mongoose.disconnect();
  }
});
