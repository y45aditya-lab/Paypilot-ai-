import { Router } from 'express';
import mongoose from 'mongoose';
import Order from '../models/Order.js';
import { audit } from '../Service/Audit.js';
import { recordCompletedCapture } from '../Service/recordCapture.js';
import {
  createPayPalOrder, capturePayPalOrder, PayPalError,
} from '../Service/paypal.service.js';
import { assessCaptureAttemptRisk } from '../Service/riskAnalysis.js';
import { createNotification } from '../Service/notifications.js';
import PurchaseRequest from '../models/PurchaseRequest.js';
import PurchaseOrder from '../models/PurchaseOrder.js';

const router = Router();

router.get('/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Order not found' });
    const order = await Order.findOne({ _id: req.params.id, user: req.user.id, organization: req.user.organizationId })
      .select('productName seats totalCents currency status createdAt updatedAt')
      .lean();
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json({ order });
  } catch (err) {
    next(err);
  }
});

router.post('/', (_req, res) => {
  res.status(403).json({ error: 'Direct orders are disabled. Submit a purchase request and wait for approval.' });
});

// Step 2: create the PayPal order. Amount comes from OUR stored order.
router.post('/:id/paypal', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Order not found' });

    const order = await Order.findOne({ _id: req.params.id, user: req.user.id, organization: req.user.organizationId });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (!['pending_approval', 'payment_created'].includes(order.status)) {
      return res.status(409).json({ error: `Order is ${order.status}` });
    }
    if (order.status === 'pending_approval') {
      if (!order.purchaseRequest) return res.status(403).json({ error: 'A purchase approval is required before checkout.' });
      const [approvedRequest, approvedPurchaseOrder] = await Promise.all([
        PurchaseRequest.exists({
          _id: order.purchaseRequest, organization: req.user.organizationId, requester: req.user.id, status: 'approved',
        }),
        PurchaseOrder.exists({
          request: order.purchaseRequest, organization: req.user.organizationId, status: 'approved',
        }),
      ]);
      if (!approvedRequest || !approvedPurchaseOrder) {
        return res.status(403).json({ error: 'A fully approved purchase request is required before checkout.' });
      }
    }
    // Already created? Return the same id (safe for page refreshes and double clicks)
    if (order.paypalOrderId) return res.json({ paypalOrderId: order.paypalOrderId });

    const pp = await createPayPalOrder({
      orderId: order._id,
      totalCents: order.totalCents,
      currency: order.currency,
      description: `${order.productName} x ${order.seats} (demo)`,
    });

    // Atomic claim: only one of two racing requests gets to save its PayPal order id
    const updated = await Order.findOneAndUpdate(
      { _id: order._id, user: req.user.id, organization: req.user.organizationId, status: 'pending_approval', purchaseRequest: { $type: 'objectId' } },
      { status: 'payment_created', paypalOrderId: pp.id },
      { new: true },
    );
    const finalOrder = updated ?? (await Order.findOne({ _id: order._id, organization: req.user.organizationId }));
    await PurchaseOrder.updateOne(
      { request: order.purchaseRequest, organization: req.user.organizationId, status: 'approved' },
      { status: 'payment_created' },
    );
    res.json({ paypalOrderId: finalOrder.paypalOrderId });
  } catch (err) {
    if (err instanceof PayPalError) {
      console.error('[paypal]', err.code, err.debugId);
      return res.status(502).json({ error: 'Payment provider error. Please try again.' });
    }
    next(err);
  }
});
// The user backs out before paying. Atomic, so it can't race a capture.
router.post('/:id/cancel', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Order not found' });

    const order = await Order.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id, organization: req.user.organizationId, status: { $in: ['pending_approval', 'payment_created'] } },
      { status: 'cancelled' },
      { new: true },
    );
    if (!order) return res.status(409).json({ error: 'This order can no longer be cancelled' });

    await audit('order.cancelled', { userId: req.user.id, orderId: order._id });
    if (order.purchaseRequest) {
      await Promise.all([
        PurchaseRequest.updateOne({ _id: order.purchaseRequest, organization: req.user.organizationId }, { status: 'cancelled' }),
        PurchaseOrder.updateOne({ request: order.purchaseRequest, organization: req.user.organizationId }, { status: 'cancelled' }),
      ]);
    }
    res.json({ order });
  } catch (err) {
    next(err);
  }
});

// Step 4: capture. The client sends NOTHING but the order id in the URL.
router.post('/:id/capture', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Order not found' });

    // LOCK: move payment_created -> capturing in ONE atomic step. A double click or
    // replay finds the status already changed and gets null here.
    const order = await Order.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id, organization: req.user.organizationId, status: 'payment_created' },
      { status: 'capturing', $inc: { captureAttempts: 1 } },
      { new: true },
    );
    if (!order) {
      const existing = await Order.findOne({ _id: req.params.id, user: req.user.id, organization: req.user.organizationId });
      if (!existing) return res.status(404).json({ error: 'Order not found' });
      if (existing.status === 'paid') return res.json({ order: existing, alreadyPaid: true }); // safe replay
      return res.status(409).json({ error: `Order cannot be captured while ${existing.status}` });
    }

    if (order.captureAttempts === 4) {
      const [signal] = assessCaptureAttemptRisk(order.captureAttempts);
      await audit('risk.transaction_signal', {
        userId: req.user.id,
        orderId: order._id,
        meta: { signals: [signal] },
      });
      await createNotification({
        userId: req.user.id,
        type: 'risk_signal',
        severity: signal.severity,
        title: 'Repeated payment attempts review signal',
        message: signal.explanation,
        orderId: order._id,
        dedupeKey: `risk-capture-attempt:${order._id}`,
      });
    }

    let capture;
    try {
      capture = await capturePayPalOrder({ paypalOrderId: order.paypalOrderId, orderId: order._id });
    } catch (err) {
      // Release the lock so the buyer can retry. A retry reuses the same
      // PayPal-Request-Id, so it can never charge twice.
      await Order.updateOne({ _id: order._id }, { status: 'payment_created' });
      if (err instanceof PayPalError) {
        console.error('[paypal capture]', err.code, err.debugId);
        const code = err.code === 'INSTRUMENT_DECLINED' ? 'INSTRUMENT_DECLINED' : undefined;
        return res.status(err.status === 422 ? 402 : 502).json({
          error: code ? 'Your payment method was declined. Please try again.' : 'Payment could not be completed.',
          code,
        });
      }
      throw err;
    }

    const cap = capture.purchase_units?.[0]?.payments?.captures?.[0];

    // Not COMPLETED (e.g. PENDING review): don't mark paid. Leave 'capturing'; Day 5's webhook resolves it.
    if (capture.status !== 'COMPLETED' || cap?.status !== 'COMPLETED') {
      return res.status(202).json({ pending: true, message: 'Payment is pending confirmation.' });
    }

    const recorded = await recordCompletedCapture(order, cap, 'capture');
    if (!recorded.ok) {
      return res.status(409).json({ error: 'Payment verification failed. Contact support.' });
    }

    const paid = await Order.findById(order._id);
    res.json({ order: paid });
  } catch (err) {
    next(err);
  }
});

export default router;