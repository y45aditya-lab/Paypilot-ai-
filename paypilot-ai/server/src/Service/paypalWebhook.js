import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import WebhookEvent from '../models/WebhookEvent.js';
import { verifyWebhookSignature } from './paypal.service.js';
import { handleEvent } from './webhooksHandlers.js';

const router = Router();

// req.body is a raw Buffer here (see app.js): the exact bytes PayPal sent.
router.post('/', async (req, res) => {
  let event;
  try {
    if (!Buffer.isBuffer(req.body)) return res.status(400).json({ error: 'Expected a JSON request body' });
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // 1) AUTHENTICITY
  let valid;
  try {
    valid = await verifyWebhookSignature({ headers: req.headers, event });
  } catch (err) {
    console.error('[webhook] verification error:', err.message);
    return res.status(500).json({ error: 'Verification unavailable' }); // 5xx makes PayPal retry
  }
  if (!valid) {
    console.warn('[webhook] rejected: bad signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }
  if (typeof event.id !== 'string' || !event.id) return res.status(400).json({ error: 'Missing event id' });

  try {
    // Each claim gets a unique token. A stale worker must not finalize an event
    // after another delivery has reclaimed it.
    const processingToken = randomUUID();
    // Claim each provider event atomically. Concurrent deliveries are retried
    // rather than acknowledged before the first handler has finished.
    try {
      await WebhookEvent.create({ eventId: event.id, eventType: event.event_type, status: 'processing', processingToken });
    } catch (err) {
      if (err.code !== 11000) throw err;
      let existing = await WebhookEvent.findOne({ eventId: event.id }).lean();
      if (!existing) return res.status(503).json({ error: 'Event claim could not be confirmed' });
      if (['processed', 'ignored'].includes(existing.status)) return res.json({ duplicate: true });
      if (existing.status === 'processing') {
        const staleBefore = new Date(Date.now() - 10 * 60 * 1000);
        const recovered = await WebhookEvent.findOneAndUpdate(
          { eventId: event.id, status: 'processing', updatedAt: { $lt: staleBefore } },
          { status: 'failed', error: 'Recovered stale processing claim' },
          { new: true },
        );
        if (!recovered) return res.status(503).json({ error: 'Event is already being processed' });
        existing = recovered.toObject();
      }
      const claimed = await WebhookEvent.findOneAndUpdate(
        { eventId: event.id, status: 'failed' },
        { status: 'processing', error: null, processingToken },
        { new: true },
      );
      if (!claimed) return res.status(503).json({ error: 'Event retry is already in progress' });
    }

    // 3) PROCESS
    try {
      const outcome = await handleEvent(event);
      await WebhookEvent.updateOne(
        { eventId: event.id, status: 'processing', processingToken },
        { status: outcome === 'ignored' ? 'ignored' : 'processed', processingToken: null },
      );
      return res.json({ received: true });
    } catch (err) {
      await WebhookEvent.updateOne(
        { eventId: event.id, status: 'processing', processingToken },
        { status: 'failed', error: String(err.message).slice(0, 200), processingToken: null },
      );
      console.error('[webhook] processing failed:', err);
      return res.status(500).json({ error: 'Processing failed' }); // PayPal will retry
    }
  } catch (err) {
    console.error('[webhook] error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

export default router;