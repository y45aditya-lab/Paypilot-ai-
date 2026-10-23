import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import WebhookEvent from '../src/models/WebhookEvent.js';

const uri = process.env.TEST_MONGODB_URI;

test('MongoDB webhook event claims are unique and atomically reclaimable', { skip: !uri }, async (t) => {
  await mongoose.connect(uri);
  const prefix = `it-${process.pid}-${Date.now()}`;
  const eventId = `${prefix}-duplicate`;
  const reclaimId = `${prefix}-reclaim`;
  try {
    await t.test('duplicate event IDs are rejected by the unique index', async () => {
      await WebhookEvent.create({ eventId, status: 'processing', processingToken: 'owner-a' });
      await assert.rejects(
        WebhookEvent.create({ eventId, status: 'processing', processingToken: 'owner-b' }),
        (error) => error?.code === 11000,
      );
    });

    await t.test('only one concurrent worker can reclaim a failed event', async () => {
      await WebhookEvent.create({ eventId: reclaimId, status: 'failed', processingToken: null });
      const claim = (token) => WebhookEvent.findOneAndUpdate(
        { eventId: reclaimId, status: 'failed' },
        { $set: { status: 'processing', processingToken: token, error: null } },
        { new: true },
      );
      const results = await Promise.all([claim('worker-a'), claim('worker-b')]);
      assert.equal(results.filter(Boolean).length, 1);
      const saved = await WebhookEvent.findOne({ eventId: reclaimId }).lean();
      assert.ok(['worker-a', 'worker-b'].includes(saved.processingToken));
    });

    await t.test('an expired claim can be reclaimed, but its old owner cannot finalize', async () => {
      const staleId = `${prefix}-stale`;
      const oldOwner = 'expired-owner';
      const newOwner = 'replacement-owner';
      await WebhookEvent.create({
        eventId: staleId,
        status: 'processing',
        processingToken: oldOwner,
      });
      await WebhookEvent.updateOne(
        { eventId: staleId },
        { $set: { updatedAt: new Date(Date.now() - 11 * 60 * 1000) } },
        { timestamps: false },
      );
      const staleBefore = new Date(Date.now() - 10 * 60 * 1000);
      const recovered = await WebhookEvent.findOneAndUpdate(
        { eventId: staleId, status: 'processing', updatedAt: { $lt: staleBefore } },
        { $set: { status: 'failed', error: 'Recovered stale processing claim' } },
        { new: true },
      );
      assert.ok(recovered);
      const reclaimed = await WebhookEvent.findOneAndUpdate(
        { eventId: staleId, status: 'failed' },
        { $set: { status: 'processing', processingToken: newOwner, error: null } },
        { new: true },
      );
      assert.equal(reclaimed.processingToken, newOwner);
      const staleFinalize = await WebhookEvent.updateOne(
        { eventId: staleId, status: 'processing', processingToken: oldOwner },
        { $set: { status: 'processed', processingToken: null } },
      );
      assert.equal(staleFinalize.matchedCount, 0);
      const current = await WebhookEvent.findOne({ eventId: staleId }).lean();
      assert.equal(current.status, 'processing');
      assert.equal(current.processingToken, newOwner);
      await WebhookEvent.deleteOne({ eventId: staleId });
    });
  } finally {
    await WebhookEvent.deleteMany({ eventId: { $in: [eventId, reclaimId] } });
    await mongoose.disconnect();
  }
});
