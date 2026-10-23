import mongoose from 'mongoose';
import Order from '../models/Order.js';
import Transaction from '../models/Transaction.js';
import { audit } from './Audit.js';
import { recordCompletedCapture } from './recordCapture.js';
import { payPalValueToCents } from './paypal.service.js';
import { createNotification } from './notifications.js';
import PurchaseOrder from '../models/PurchaseOrder.js';
import Subscription from '../models/Subscription.js';

const OPEN = ['payment_created', 'capturing']; // states where a payment may still be settling

// Returns 'processed' or 'ignored'. THROW to make PayPal retry later.
export async function handleEvent(event) {
  switch (event.event_type) {
    case 'PAYMENT.CAPTURE.COMPLETED':
      return onCaptureCompleted(event.resource);
    case 'PAYMENT.CAPTURE.DENIED':
      return onCaptureDenied(event.resource);
    case 'PAYMENT.CAPTURE.REFUNDED':
    case 'PAYMENT.REFUND.COMPLETED':
      return onRefundCompleted(event.resource);
    case 'PAYMENT.REFUND.PENDING':
      return onRefundPending(event.resource);
    case 'PAYMENT.REFUND.FAILED':
      return onRefundFailed(event.resource);
    default:
      return 'ignored';
  }
}

async function findOurOrder(resource) {
  // custom_id is the order id we set when creating the PayPal order (Day 4)
  const id = resource?.custom_id;
  if (mongoose.isValidObjectId(id)) return Order.findById(id);
  const paypalOrderId = resource?.supplementary_data?.related_ids?.order_id;
  if (paypalOrderId) return Order.findOne({ paypalOrderId });
  return null;
}

async function onCaptureCompleted(cap) {
  const order = await findOurOrder(cap);
  if (!order) return 'ignored'; // not one of ours

  const ppOrderId = cap.supplementary_data?.related_ids?.order_id;
  if (ppOrderId && ppOrderId !== order.paypalOrderId) {
    await audit('webhook.order_mismatch', { userId: order.user, orderId: order._id, meta: { ppOrderId } });
    return 'ignored';
  }

  await recordCompletedCapture(order, cap, 'webhook');
  return 'processed';
}

async function onCaptureDenied(cap) {
  const order = await findOurOrder(cap);
  if (!order) return 'ignored';
  await Order.updateOne({ _id: order._id, status: { $in: OPEN } }, { status: 'failed' });
  await audit('webhook.capture_denied', { userId: order.user, orderId: order._id });
  await createNotification({
    userId: order.user,
    type: 'payment_failed',
    severity: 'medium',
    title: 'Payment was not completed',
    message: `${order.productName} payment was declined or denied by PayPal.`,
    orderId: order._id,
    dedupeKey: `payment-denied:${order._id}`,
  });
  return 'processed';
}

function getCaptureId(resource) {
  return resource?.capture_id
    ?? resource?.supplementary_data?.related_ids?.capture_id
    ?? (resource?.status === 'REFUNDED' ? resource.id : null);
}

async function onRefundCompleted(resource) {
  const captureId = getCaptureId(resource);
  if (!captureId) return 'ignored';
  const transaction = await Transaction.findOne({ paypalCaptureId: captureId });
  if (!transaction) return 'ignored';

  // Only mark the transaction fully refunded when PayPal explicitly reports the
  // exact original amount and currency. Missing or malformed amounts must not be
  // interpreted as a full refund.
  const amountCents = resource.amount?.value === undefined
    ? Number.NaN
    : payPalValueToCents(resource.amount.value);
  if (!Number.isSafeInteger(amountCents) || amountCents !== transaction.amountCents
    || resource.amount?.currency_code !== transaction.currency) {
    const needsReview = await Transaction.findOneAndUpdate(
      {
        _id: transaction._id,
        status: 'completed',
        refundStatus: { $in: ['processing', 'pending'] },
      },
      { refundStatus: 'review_required' },
      { new: true },
    );
    // A late or duplicate mismatched event must not downgrade a refund that has
    // already reached a terminal state.
    if (needsReview) {
      await audit('refund.amount_mismatch', {
        userId: needsReview.user,
        orderId: needsReview.order,
        meta: { transactionId: String(needsReview._id), refundId: resource.id },
      });
      await createNotification({
        userId: needsReview.user,
        type: 'refund_review',
        severity: 'high',
        title: 'Refund needs review',
        message: 'A PayPal refund did not match the original charge. Review the transaction before taking further action.',
        orderId: needsReview.order,
        transactionId: needsReview._id,
        dedupeKey: `refund-review:${needsReview._id}`,
      });
    }
    return 'processed';
  }

  const changed = await Transaction.findOneAndUpdate(
    { _id: transaction._id, status: 'completed', refundStatus: { $in: ['processing', 'pending'] } },
    { status: 'refunded', refundStatus: 'completed', refundId: resource.id, refundedAt: new Date() },
    { new: true },
  );
  if (changed) {
    const order = await Order.findOne({ _id: changed.order, organization: changed.organization }).select('purchaseRequest');
    if (order?.purchaseRequest) {
      const purchaseOrder = await PurchaseOrder.findOne({
        request: order.purchaseRequest, organization: changed.organization,
      }).select('_id');
      if (purchaseOrder) {
        await Promise.all([
          Subscription.updateOne({ purchaseOrder: purchaseOrder._id }, { status: 'cancelled' }),
          PurchaseOrder.updateOne({ _id: purchaseOrder._id }, { status: 'cancelled' }),
        ]);
      }
    }
    await audit('refund.completed', {
      userId: changed.user,
      orderId: changed.order,
      meta: { transactionId: String(changed._id), refundId: resource.id, amountCents },
    });
    await createNotification({
      userId: changed.user,
      type: 'refund_completed',
      title: 'Refund completed',
      message: `${changed.productName} · ${changed.currency} ${(amountCents / 100).toFixed(2)} returned.`,
      orderId: changed.order,
      transactionId: changed._id,
      dedupeKey: `refund-completed:${resource.id}`,
    });
  }
  return 'processed';
}

async function onRefundPending(resource) {
  const captureId = getCaptureId(resource);
  if (!captureId) return 'ignored';
  await Transaction.updateOne(
    { paypalCaptureId: captureId, status: 'completed', refundStatus: 'processing' },
    { refundStatus: 'pending', refundId: resource.id },
  );
  return 'processed';
}

async function onRefundFailed(resource) {
  const captureId = getCaptureId(resource);
  if (!captureId) return 'ignored';
  const transaction = await Transaction.findOneAndUpdate(
    { paypalCaptureId: captureId, status: 'completed', refundStatus: { $in: ['processing', 'pending'] } },
    { refundStatus: 'failed', refundId: resource.id },
    { new: true },
  );
  if (transaction) {
    await audit('refund.failed', {
      userId: transaction.user,
      orderId: transaction.order,
      meta: { transactionId: String(transaction._id), refundId: resource.id },
    });
  }
  return 'processed';
}