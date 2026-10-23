import { randomUUID } from 'node:crypto';
import Transaction from '../models/Transaction.js';
import {
  getPayPalRefund,
  refundPayPalCapture,
  isDefinitivePayPalRefundFailure,
  payPalValueToCents,
} from './paypal.service.js';
import { audit } from './Audit.js';
import { createNotification } from './notifications.js';

const STALE_AFTER_MS = 2 * 60 * 1000;
const LEASE_MS = 10 * 60 * 1000;
const INTERVAL_MS = 60 * 1000;
const BATCH_SIZE = 25;
const MAX_UNKNOWN_ID_ATTEMPTS = 5;
let running = false;

export function isExactFullRefund(transaction, refund) {
  const amount = refund?.amount;
  const cents = amount?.value === undefined ? Number.NaN : payPalValueToCents(amount.value);
  return Number.isSafeInteger(cents)
    && cents === transaction.amountCents
    && amount?.currency_code === transaction.currency;
}

async function markNeedsReview(transaction, reason) {
  const updated = await Transaction.findOneAndUpdate(
    { _id: transaction._id, refundStatus: { $in: ['processing', 'pending'] } },
    { refundStatus: 'review_required' },
    { new: true },
  );
  if (!updated) return;
  await audit('refund.needs_review', {
    userId: updated.user,
    orderId: updated.order,
    meta: { transactionId: String(updated._id), reason },
  });
  await createNotification({
    userId: updated.user,
    type: 'refund_review',
    severity: 'high',
    title: 'Refund needs review',
    message: 'PayPal refund status could not be safely confirmed. Check PayPal before taking further action.',
    orderId: updated.order,
    transactionId: updated._id,
    dedupeKey: `refund-review:${updated._id}`,
  });
}

async function applyProviderRefund(transaction, refund) {
  if (!isExactFullRefund(transaction, refund)) {
    await markNeedsReview(transaction, 'refund_amount_or_currency_mismatch');
    return;
  }

  if (refund.status === 'COMPLETED') {
    const updated = await Transaction.findOneAndUpdate(
      { _id: transaction._id, status: 'completed', refundStatus: { $in: ['processing', 'pending'] } },
      {
        status: 'refunded',
        refundStatus: 'completed',
        refundId: refund.id || transaction.refundId,
        refundedAt: new Date(),
      },
      { new: true },
    );
    if (!updated) return;
    await audit('refund.completed', {
      userId: updated.user,
      orderId: updated.order,
      meta: { transactionId: String(updated._id), refundId: updated.refundId, amountCents: updated.amountCents },
    });
    await createNotification({
      userId: updated.user,
      type: 'refund_completed',
      title: 'Refund completed',
      message: `${updated.productName} · ${updated.currency} ${(updated.amountCents / 100).toFixed(2)} returned.`,
      orderId: updated.order,
      transactionId: updated._id,
      dedupeKey: `refund-completed:${updated.refundId || updated._id}`,
    });
    return;
  }

  if (refund.status === 'PENDING') {
    await Transaction.updateOne(
      { _id: transaction._id, refundStatus: { $in: ['processing', 'pending'] } },
      { refundStatus: 'pending', ...(refund.id ? { refundId: refund.id } : {}) },
    );
    return;
  }

  if (refund.status === 'FAILED' || refund.status === 'CANCELLED') {
    const updated = await Transaction.findOneAndUpdate(
      { _id: transaction._id, refundStatus: { $in: ['processing', 'pending'] } },
      { refundStatus: 'failed', ...(refund.id ? { refundId: refund.id } : {}) },
      { new: true },
    );
    if (updated) {
      await audit('refund.failed', {
        userId: updated.user,
        orderId: updated.order,
        meta: { transactionId: String(updated._id), refundId: refund.id },
      });
    }
    return;
  }

  await markNeedsReview(transaction, 'unrecognized_provider_refund_status');
}

async function reconcileOne(transaction) {
  try {
    let refund;
    if (transaction.refundId) {
      try {
        refund = await getPayPalRefund(transaction.refundId);
      } catch (error) {
        // A missing refund endpoint result is not proof the refund failed.
        console.warn('[refund-reconciliation] Provider lookup unresolved:', String(transaction._id), error?.message || 'unknown error');
        return;
      }
    } else {
      if ((transaction.refundReconciliationAttempts || 0) >= MAX_UNKNOWN_ID_ATTEMPTS) {
        await markNeedsReview(transaction, 'refund_id_unknown_after_retries');
        return;
      }
      try {
        // This reuses the original deterministic PayPal-Request-Id for this
        // transaction, so retrying the same logical refund does not create a
        // new refund request.
        refund = await refundPayPalCapture({
          captureId: transaction.paypalCaptureId,
          transactionId: transaction._id,
        });
      } catch (error) {
        if (isDefinitivePayPalRefundFailure(error)) {
          const updated = await Transaction.findOneAndUpdate(
            { _id: transaction._id, refundStatus: { $in: ['processing', 'pending'] } },
            { refundStatus: 'failed' },
            { new: true },
          );
          if (updated) {
            await audit('refund.request_failed', {
              userId: updated.user,
              orderId: updated.order,
              meta: { transactionId: String(updated._id), providerCode: error.code },
            });
          }
        } else {
          console.warn('[refund-reconciliation] Retry outcome remains uncertain:', String(transaction._id), error?.message || 'unknown error');
        }
        return;
      }
    }

    if (refund?.id && !transaction.refundId) {
      await Transaction.updateOne(
        { _id: transaction._id, refundStatus: { $in: ['processing', 'pending'] } },
        { refundId: refund.id },
      );
    }
    await applyProviderRefund(transaction, refund);
  } catch (error) {
    console.error('[refund-reconciliation] Transaction reconciliation failed:', String(transaction._id), error?.message || 'unknown error');
  } finally {
    await Transaction.updateOne(
      { _id: transaction._id, refundReconciliationLeaseToken: transaction.refundReconciliationLeaseToken },
      { $unset: { refundReconciliationLeaseUntil: 1, refundReconciliationLeaseToken: 1 } },
    ).catch((error) => console.error('[refund-reconciliation] Could not release lease:', error.message));
  }
}

export async function reconcileStaleRefunds() {
  if (running) return { skipped: true, checked: 0 };
  running = true;
  let checked = 0;
  try {
    const now = new Date();
    const staleBefore = new Date(now.getTime() - STALE_AFTER_MS);
    const leaseUntil = new Date(now.getTime() + LEASE_MS);
    while (checked < BATCH_SIZE) {
      const leaseToken = randomUUID();
      const transaction = await Transaction.findOneAndUpdate(
        {
          status: 'completed',
          refundStatus: { $in: ['processing', 'pending'] },
          paypalCaptureId: { $type: 'string' },
          updatedAt: { $lt: staleBefore },
          $or: [
            { refundReconciliationLeaseUntil: { $exists: false } },
            { refundReconciliationLeaseUntil: { $lt: now } },
          ],
        },
        {
          $set: { refundReconciliationLeaseUntil: leaseUntil, refundReconciliationLeaseToken: leaseToken },
          $inc: { refundReconciliationAttempts: 1 },
        },
        { new: true, sort: { updatedAt: 1 } },
      );
      if (!transaction) break;
      checked += 1;
      await reconcileOne(transaction);
    }
    return { skipped: false, checked };
  } catch (error) {
    console.error('[refund-reconciliation] Job failed:', error?.message || 'unknown error');
    return { skipped: false, checked, error: true };
  } finally {
    running = false;
  }
}

export function startRefundReconciliationSchedule() {
  const run = () => { void reconcileStaleRefunds(); };
  run();
  const timer = setInterval(run, INTERVAL_MS);
  timer.unref();
  return timer;
}
