import Transaction from '../models/Transaction.js';
import Order from '../models/Order.js';
import { payPalValueToCents } from './paypal.service.js';
import { audit } from './Audit.js';
import { createNotification } from './notifications.js';
import { assessTransactionRisk } from './riskAnalysis.js';
import PurchaseRequest from '../models/PurchaseRequest.js';
import PurchaseOrder from '../models/PurchaseOrder.js';
import Subscription from '../models/Subscription.js';

export async function recordCompletedCapture(order, capture, source) {
  const amountCents = payPalValueToCents(capture?.amount?.value);
  if (!capture?.id || !Number.isSafeInteger(amountCents)
    || amountCents !== order.totalCents
    || capture.amount.currency_code !== order.currency) {
    await Order.updateOne({ _id: order._id, status: { $in: ['payment_created', 'capturing'] } }, { status: 'failed' });
    await audit(`${source}.amount_mismatch`, {
      userId: order.user,
      orderId: order._id,
      meta: { expectedCents: order.totalCents, currency: order.currency },
    });
    await createNotification({
      userId: order.user,
      type: 'payment_review',
      severity: 'high',
      title: 'Payment needs manual review',
      message: 'PayPal reported a charge that did not match the order. Contact support before placing another order.',
      orderId: order._id,
      dedupeKey: `capture-mismatch:${order._id}`,
    });
    return { ok: false };
  }

  let transaction;
  let newlyRecorded = false;
  try {
    transaction = await Transaction.create({
      organization: order.organization,
      user: order.user,
      order: order._id,
      paypalOrderId: order.paypalOrderId,
      paypalCaptureId: capture.id,
      productName: order.productName,
      amountCents,
      currency: capture.amount.currency_code,
      status: 'completed',
    });
    newlyRecorded = true;
  } catch (error) {
    if (error.code !== 11000) throw error;
    transaction = await Transaction.findOne({ paypalCaptureId: capture.id });
    if (!transaction) throw error;
    if (String(transaction.organization) !== String(order.organization)
      || String(transaction.order) !== String(order._id)
      || String(transaction.user) !== String(order.user)
      || transaction.amountCents !== amountCents
      || transaction.currency !== capture.amount.currency_code) {
      await audit(`${source}.duplicate_capture_mismatch`, {
        userId: order.user,
        orderId: order._id,
        meta: { captureId: capture.id },
      });
      await createNotification({
        userId: order.user,
        type: 'payment_review',
        severity: 'high',
        title: 'Payment needs manual review',
        message: 'A PayPal capture did not match this order record. Contact support before placing another order.',
        orderId: order._id,
        dedupeKey: `capture-duplicate-mismatch:${order._id}`,
      });
      return { ok: false };
    }
  }

  const updated = await Order.updateOne(
    { _id: order._id, status: { $in: ['payment_created', 'capturing'] } },
    { status: 'paid' },
  );
  if (order.purchaseRequest) {
    const purchaseOrder = await PurchaseOrder.findOne({ request: order.purchaseRequest, organization: order.organization });
    await PurchaseRequest.updateOne({ _id: order.purchaseRequest, organization: order.organization }, { status: 'paid' });
    if (purchaseOrder) await PurchaseOrder.updateOne({ _id: purchaseOrder._id }, { status: 'paid' });
    if (purchaseOrder) {
      const renewalDate = new Date();
      const renewalDay = renewalDate.getDate();
      renewalDate.setDate(1);
      renewalDate.setMonth(renewalDate.getMonth() + 1);
      const lastDay = new Date(renewalDate.getFullYear(), renewalDate.getMonth() + 1, 0).getDate();
      renewalDate.setDate(Math.min(renewalDay, lastDay));
      await Subscription.findOneAndUpdate(
        { purchaseOrder: purchaseOrder._id },
        {
          $setOnInsert: {
            organization: order.organization,
            user: order.user,
            purchaseOrder: purchaseOrder._id,
            product: order.product,
            category: order.category,
            productName: order.productName,
            department: order.department || 'General',
            amountCents,
            currency: order.currency,
            renewalDate,
            status: 'active',
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
    }
  }
  if (newlyRecorded) {
    await audit(`${source}.capture_completed`, {
      userId: order.user,
      orderId: order._id,
      meta: { transactionId: String(transaction._id), captureId: capture.id, amountCents },
    });
    const recent = await Transaction.find({
      organization: order.organization,
      user: order.user,
      _id: { $ne: transaction._id },
      status: 'completed',
      createdAt: { $gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
    }).sort({ createdAt: -1 }).limit(50).select('amountCents currency createdAt').lean();
    const riskSignals = assessTransactionRisk(transaction, recent);
    if (riskSignals.length > 0) {
      await audit('risk.transaction_signal', {
        userId: order.user,
        orderId: order._id,
        meta: { transactionId: String(transaction._id), signals: riskSignals },
      });
      for (const signal of riskSignals) {
        await createNotification({
          userId: order.user,
          type: 'risk_signal',
          severity: signal.severity,
          title: 'Transaction review signal',
          message: signal.explanation,
          orderId: order._id,
          transactionId: transaction._id,
          dedupeKey: `risk:${transaction._id}:${signal.code}`,
        });
      }
    }
  }

  // Always attempt the idempotent notification, including when a retry finds
  // an existing capture transaction. This repairs the crash window where the
  // transaction was committed but the process stopped before notification creation.
  // Notification.dedupeKey is unique, so replays do not create duplicate rows.
  await createNotification({
    userId: order.user,
    type: 'payment_completed',
    title: 'Payment confirmed',
    message: `${order.productName} · ${order.currency} ${(amountCents / 100).toFixed(2)}.`,
    orderId: order._id,
    transactionId: transaction._id,
    dedupeKey: `payment-completed:${capture.id}`,
  });

  const currentStatus = updated.modifiedCount === 1
    ? 'paid'
    : await Order.findById(order._id).select('status').then((current) => current?.status);
  if (currentStatus && currentStatus !== 'paid') {
    await audit(`${source}.needs_review`, {
      userId: order.user,
      orderId: order._id,
      meta: { orderStatus: order.status, captureId: capture.id },
    });
    await createNotification({
      userId: order.user,
      type: 'payment_review',
      severity: 'high',
      title: 'Payment needs manual review',
      message: 'PayPal confirmed payment for an order in an unexpected state. Contact support to reconcile the order.',
      orderId: order._id,
      transactionId: transaction._id,
      dedupeKey: `capture-state-review:${transaction._id}`,
    });
  }
  return { ok: true, transaction, newlyRecorded };
}
