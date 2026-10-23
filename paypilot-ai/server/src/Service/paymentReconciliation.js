import { randomUUID } from 'node:crypto';
import Order from '../models/Order.js';
import {
  getPayPalOrder,
  capturePayPalOrder,
  isDefinitivePayPalFailure,
} from './paypal.service.js';
import { recordCompletedCapture } from './recordCapture.js';

const STALE_AFTER_MS = 2 * 60 * 1000;
const LEASE_MS = 10 * 60 * 1000;
const INTERVAL_MS = 60 * 1000;
const BATCH_SIZE = 25;

let running = false;

export function completedCapture(paypalOrder) {
  const units = Array.isArray(paypalOrder?.purchase_units) ? paypalOrder.purchase_units : [];
  for (const unit of units) {
    const captures = unit?.payments?.captures;
    if (Array.isArray(captures)) {
      const capture = captures.find((item) => item?.status === 'COMPLETED');
      if (capture) return capture;
    }
  }
  return null;
}

export async function reconcileOne(order, dependencies = {}) {
  const {
    getPayPalOrder: lookupPayPalOrder = getPayPalOrder,
    capturePayPalOrder: captureOrder = capturePayPalOrder,
    isDefinitivePayPalFailure: isDefinitiveFailure = isDefinitivePayPalFailure,
    recordCompletedCapture: recordCapture = recordCompletedCapture,
  } = dependencies;

  try {
    let providerOrder;
    try {
      providerOrder = await lookupPayPalOrder(order.paypalOrderId);
    } catch (error) {
      console.error('[payment-reconciliation] PayPal order lookup failed:', error?.message || 'unknown error');
      return;
    }

    let capture = completedCapture(providerOrder);

    // An APPROVED order with a previously uncertain capture can be retried using
    // the same stable PayPal-Request-Id. This avoids a second logical capture.
    if (!capture && providerOrder.status === 'APPROVED') {
      try {
        const result = await captureOrder({
          paypalOrderId: order.paypalOrderId,
          orderId: order._id,
        });
        capture = completedCapture(result);
      } catch (error) {
        if (isDefinitiveFailure(error)) {
          await Order.updateOne(
            { _id: order._id, status: 'capturing' },
            { status: 'payment_created' },
          );
          return;
        }
        console.error('[payment-reconciliation] Capture outcome remains uncertain:', error?.message || 'unknown error');
        return;
      }
    }

    if (capture) {
      const result = await recordCapture(order, capture, 'reconciliation');
      if (!result.ok) {
        console.warn('[payment-reconciliation] Capture requires manual review:', String(order._id));
      }
      return;
    }

    // Pending/unknown provider states remain capturing. A later run or verified
    // PayPal webhook can resolve the order; never infer failure from missing data.
  } catch (error) {
    // A single malformed provider response or database failure must not stop the
    // whole batch; the lease is released below so a later run can retry.
    console.error('[payment-reconciliation] Order reconciliation failed:', String(order._id), error?.message || 'unknown error');
  } finally {
    await Order.updateOne(
      { _id: order._id, reconciliationLeaseToken: order.reconciliationLeaseToken },
      { $unset: { reconciliationLeaseUntil: 1, reconciliationLeaseToken: 1 } },
    ).catch((error) => {
      console.error('[payment-reconciliation] Could not release lease:', error.message);
    });
  }
}

export async function reconcileStalePayments() {
  if (running) return { skipped: true, checked: 0 };
  running = true;
  let checked = 0;

  try {
    const now = new Date();
    const staleBefore = new Date(now.getTime() - STALE_AFTER_MS);
    const leaseUntil = new Date(now.getTime() + LEASE_MS);

    while (checked < BATCH_SIZE) {
      const leaseToken = randomUUID();
      const order = await Order.findOneAndUpdate(
        {
          status: 'capturing',
          paypalOrderId: { $type: 'string' },
          updatedAt: { $lt: staleBefore },
          $or: [
            { reconciliationLeaseUntil: { $exists: false } },
            { reconciliationLeaseUntil: { $lt: now } },
          ],
        },
        {
          $set: { reconciliationLeaseUntil: leaseUntil, reconciliationLeaseToken: leaseToken },
          $inc: { reconciliationAttempts: 1 },
        },
        { new: true, sort: { updatedAt: 1 } },
      );

      if (!order) break;
      checked += 1;
      await reconcileOne(order);
    }

    return { skipped: false, checked };
  } catch (error) {
    console.error('[payment-reconciliation] Job failed:', error?.message || 'unknown error');
    return { skipped: false, checked, error: true };
  } finally {
    running = false;
  }
}

export function startPaymentReconciliationSchedule() {
  const run = () => {
    void reconcileStalePayments();
  };
  run();
  const timer = setInterval(run, INTERVAL_MS);
  timer.unref();
  return timer;
}
