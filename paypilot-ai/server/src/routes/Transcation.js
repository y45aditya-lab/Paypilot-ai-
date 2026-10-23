import { Router } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import Transaction from '../models/Transaction.js';
import AuditLog from '../models/Auditlog.js';
import { audit } from '../Service/Audit.js';
import { refundPayPalCapture, PayPalError, isDefinitivePayPalRefundFailure, isExactPayPalRefund } from '../Service/paypal.service.js';
import { createNotification } from '../Service/notifications.js';
import Order from '../models/Order.js';
import Subscription from '../models/Subscription.js';
import PurchaseOrder from '../models/PurchaseOrder.js';

export function createTransactionRouter({
  TransactionModel = Transaction,
  refundCapture = refundPayPalCapture,
  PayPalErrorClass = PayPalError,
  classifyRefundFailure = isDefinitivePayPalRefundFailure,
  exactRefund = isExactPayPalRefund,
  auditEvent = audit,
  notify = createNotification,
  OrderModel = Order,
  SubscriptionModel = Subscription,
  PurchaseOrderModel = PurchaseOrder,
} = {}) {
const router = Router(); // mounted behind requireAuth

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  status: z.enum(['completed', 'pending', 'failed', 'refunded']).optional(),
  q: z.string().trim().max(50).optional(),
});

// Never put raw user text into a regex: "(" or "*" would crash or hang the query
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const publicTransaction = (transaction) => ({
  id: String(transaction._id),
  productName: transaction.productName,
  amountCents: transaction.amountCents,
  currency: transaction.currency,
  status: transaction.status,
  refundStatus: transaction.refundStatus ?? 'not_requested',
  refundId: transaction.refundId,
  refundedAt: transaction.refundedAt,
  createdAt: transaction.createdAt,
});

router.post('/:id/refund', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Transaction not found' });

    let transaction = await TransactionModel.findOneAndUpdate(
      {
        _id: req.params.id,
        user: req.user.id,
        organization: req.user.organizationId,
        status: 'completed',
        paypalCaptureId: { $type: 'string' },
        $or: [
          { refundStatus: { $exists: false } },
          { refundStatus: { $in: ['not_requested', 'failed'] } },
        ],
      },
      { refundStatus: 'processing' },
      { new: true },
    );
    if (!transaction) {
      const existing = await TransactionModel.findOne({ _id: req.params.id, user: req.user.id, organization: req.user.organizationId });
      if (!existing) return res.status(404).json({ error: 'Transaction not found' });
      if (existing.refundStatus === 'processing' || existing.refundStatus === 'pending') {
        return res.status(202).json({ transaction: publicTransaction(existing), pending: true });
      }
      if (existing.status === 'refunded' || existing.refundStatus === 'completed') {
        return res.json({ transaction: publicTransaction(existing), alreadyRefunded: true });
      }
      return res.status(409).json({ error: 'This transaction is not eligible for a full refund.' });
    }

    try {
      const result = await refundCapture({
        captureId: transaction.paypalCaptureId,
        transactionId: transaction._id,
      });
      let refundUpdate;
      if (result.status === 'COMPLETED') {
        const exactFullRefund = exactRefund(result, transaction.amountCents, transaction.currency);
        refundUpdate = {
          refundId: result.id,
          refundStatus: exactFullRefund ? 'completed' : 'review_required',
          ...(exactFullRefund ? { status: 'refunded', refundedAt: new Date() } : {}),
        };
      } else if (result.status === 'PENDING') {
        refundUpdate = { refundStatus: 'pending', refundId: result.id };
      } else {
        refundUpdate = { refundStatus: 'review_required', ...(result.id ? { refundId: result.id } : {}) };
      }

      // A webhook may settle the refund while the PayPal request is in flight.
      // Only transition from processing; never overwrite a newer terminal state.
      const settled = await TransactionModel.findOneAndUpdate(
        { _id: transaction._id, status: 'completed', refundStatus: 'processing' },
        { $set: refundUpdate },
        { new: true },
      );
      transaction = settled || await TransactionModel.findById(transaction._id);
      if (!transaction) throw new Error('Transaction disappeared while recording refund outcome');
      if (transaction.refundStatus === 'completed') {
        const order = await OrderModel.findOne({
          _id: transaction.order,
          organization: req.user.organizationId,
        }).select('purchaseRequest');
        if (order?.purchaseRequest) {
          const purchaseOrder = await PurchaseOrderModel.findOne({
            request: order.purchaseRequest, organization: req.user.organizationId,
          }).select('_id');
          if (purchaseOrder) {
            await Promise.all([
              SubscriptionModel.updateOne({ purchaseOrder: purchaseOrder._id }, { status: 'cancelled' }),
              PurchaseOrderModel.updateOne({ _id: purchaseOrder._id }, { status: 'cancelled' }),
            ]);
          }
        }
      }
    } catch (error) {
      const definitiveFailure = classifyRefundFailure(error);

      // A timeout, network failure, rate limit, conflict, or provider 5xx does not
      // prove the refund failed. Keep it pending until PayPal confirms the outcome.
      const recordedFailure = await TransactionModel.findOneAndUpdate(
        { _id: transaction._id, status: 'completed', refundStatus: 'processing' },
        { $set: { refundStatus: definitiveFailure ? 'failed' : 'pending' } },
        { new: true },
      );
      transaction = recordedFailure || await TransactionModel.findById(transaction._id);
      if (!transaction) throw new Error('Transaction disappeared while recording refund failure');

      // If a verified webhook already settled the refund, the late HTTP error
      // must not downgrade that state or tell the caller it is safe to retry.
      if (transaction.status === 'refunded' || transaction.refundStatus === 'completed') {
        return res.json({ transaction: publicTransaction(transaction), alreadyRefunded: true });
      }
      if (recordedFailure) {
        await auditEvent(definitiveFailure ? 'refund.request_failed' : 'refund.outcome_uncertain', {
          userId: transaction.user,
          orderId: transaction.order,
          meta: { transactionId: String(transaction._id), providerCode: error?.code },
        });
      }

      if (error instanceof PayPalErrorClass) {
        console.error('[paypal refund]', error.code, error.debugId);
      } else {
        console.error('[paypal refund] outcome unknown:', error?.message || 'unknown error');
      }

      if (!definitiveFailure) {
        return res.status(202).json({
          transaction: publicTransaction(transaction),
          pending: true,
          message: 'PayPal has not confirmed the refund outcome. Do not submit another refund request; status is awaiting confirmation.',
        });
      }

      return res.status(502).json({
        transaction: publicTransaction(transaction),
        error: 'PayPal rejected the refund request. Check the transaction status before trying again.',
      });
    }

    await auditEvent('refund.requested', {
      userId: transaction.user,
      orderId: transaction.order,
      meta: { transactionId: String(transaction._id), refundId: transaction.refundId, status: transaction.refundStatus },
    });
    if (transaction.refundStatus === 'completed') {
      await notify({
        userId: transaction.user,
        type: 'refund_completed',
        title: 'Refund completed',
        message: `${transaction.productName} · ${transaction.currency} ${(transaction.amountCents / 100).toFixed(2)} returned.`,
        orderId: transaction.order,
        transactionId: transaction._id,
        dedupeKey: `refund-completed:${transaction.refundId}`,
      });
    } else if (transaction.refundStatus === 'review_required') {
      await auditEvent('refund.needs_review', {
        userId: transaction.user,
        orderId: transaction.order,
        meta: { transactionId: String(transaction._id), refundId: transaction.refundId },
      });
      await notify({
        userId: transaction.user,
        type: 'refund_review',
        severity: 'high',
        title: 'Refund needs review',
        message: 'PayPal returned an unrecognized refund status. Check the PayPal dashboard before retrying.',
        orderId: transaction.order,
        transactionId: transaction._id,
        dedupeKey: `refund-review:${transaction._id}`,
      });
    }
    res.status(['pending', 'review_required'].includes(transaction.refundStatus) ? 202 : 200).json({
      transaction: publicTransaction(transaction),
      pending: transaction.refundStatus === 'pending',
      reviewRequired: transaction.refundStatus === 'review_required',
    });
  } catch (err) {
    next(err);
  }
});

router.get('/audit', async (req, res, next) => {
  try {
    const items = await AuditLog.find({ organization: req.user.organizationId, user: req.user.id })
      .sort({ createdAt: -1 })
      .limit(50)
      .select('action order meta createdAt')
      .lean();
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid query parameters' });
    const { page, limit, status, q } = parsed.data;

    const filter = { organization: req.user.organizationId, user: req.user.id };
    if (status) filter.status = status;
    if (q) filter.productName = { $regex: escapeRegex(q), $options: 'i' };

    const [items, total] = await Promise.all([
      Transaction.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select('productName amountCents currency status paypalCaptureId refundStatus refundId refundedAt createdAt')
        .lean(),
      Transaction.countDocuments(filter),
    ]);

    res.json({ items, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) });
  } catch (err) {
    next(err);
  }
});

return router;
}

export default createTransactionRouter();
