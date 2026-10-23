import { randomUUID } from 'node:crypto';
import OutboxEvent from '../models/OutboxEvent.js';
import Notification from '../models/Notification.js';
import User from '../models/User.js';
import { createNotification } from './notifications.js';

const BATCH_SIZE = 20;
const MAX_ATTEMPTS = 12;
const LEASE_MS = 2 * 60 * 1000;

export async function enqueueOutboxEvent({ eventKey, eventType, payload }) {
  try {
    return await OutboxEvent.create({ eventKey, eventType, payload });
  } catch (error) {
    if (error.code === 11000) return OutboxEvent.findOne({ eventKey });
    throw error;
  }
}

async function processEvent(event) {
  if (event.eventType !== 'payment_notification') {
    throw new Error(`Unsupported outbox event type: ${event.eventType}`);
  }

  const payload = event.payload;
  const existing = await Notification.findOne({ dedupeKey: payload.dedupeKey }).select('_id').lean();
  if (existing) return;

  const user = await User.findById(payload.userId).select('notificationPreferences').lean();
  if (!user) throw new Error('Outbox notification recipient no longer exists.');

  // Respect the user's payment-notification preference; a disabled preference
  // is an intentional no-op, not a delivery failure.
  if (user.notificationPreferences?.payment === false) return;

  await createNotification(payload);
  const saved = await Notification.findOne({ dedupeKey: payload.dedupeKey }).select('_id').lean();
  if (!saved) throw new Error('Notification was not persisted; retry outbox event.');
}

async function claimNextEvent() {
  const now = new Date();
  const token = randomUUID();
  const staleBefore = new Date(now.getTime() - LEASE_MS);
  const event = await OutboxEvent.findOneAndUpdate(
    {
      $or: [
        { status: 'pending', availableAt: { $lte: now } },
        { status: 'failed', availableAt: { $lte: now } },
        { status: 'processing', updatedAt: { $lt: staleBefore } },
      ],
    },
    {
      $set: { status: 'processing', processingToken: token },
      $inc: { attempts: 1 },
    },
    { new: true, sort: { availableAt: 1, createdAt: 1 } },
  );
  return event ? { event, token } : null;
}

export async function processOutboxBatch() {
  let processed = 0;
  for (let i = 0; i < BATCH_SIZE; i += 1) {
    const claimed = await claimNextEvent();
    if (!claimed) break;
    const { event, token } = claimed;
    try {
      await processEvent(event);
      await OutboxEvent.updateOne(
        { _id: event._id, status: 'processing', processingToken: token },
        { $set: { status: 'processed', processedAt: new Date(), processingToken: null, lastError: null } },
      );
      processed += 1;
    } catch (error) {
      const terminal = event.attempts >= MAX_ATTEMPTS;
      const delayMs = Math.min(60 * 60 * 1000, 1000 * (2 ** Math.min(event.attempts, 10)));
      await OutboxEvent.updateOne(
        { _id: event._id, status: 'processing', processingToken: token },
        {
          $set: {
            status: terminal ? 'failed' : 'pending',
            availableAt: new Date(Date.now() + delayMs),
            processingToken: null,
            lastError: String(error.message).slice(0, 300),
          },
        },
      );
      console.error('[outbox] event processing failed:', event.eventKey, error.message);
    }
  }
  return { processed };
}

export function startOutboxSchedule() {
  const timer = setInterval(() => {
    void processOutboxBatch().catch((error) => console.error('[outbox] batch failed:', error.message));
  }, 5000);
  timer.unref?.();
  void processOutboxBatch().catch((error) => console.error('[outbox] initial batch failed:', error.message));
  return timer;
}
