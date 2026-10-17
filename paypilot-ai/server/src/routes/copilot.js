import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import Transaction from '../models/Transaction.js';
import AuditLog from '../models/Auditlog.js';
import { answerTransactionQuestionWithAI } from '../Service/transactionCopilot.js';

const router = Router();
const requestSchema = z.object({
  question: z.string().trim().min(5).max(1000),
});

router.post('/transactions', async (req, res, next) => {
  try {
    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'question must be between 5 and 1000 characters' });

    const userId = new mongoose.Types.ObjectId(req.user.id);
    const organizationId = new mongoose.Types.ObjectId(req.user.organizationId);
    const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const [transactions, grouped, riskEvents, refundedProducts] = await Promise.all([
      Transaction.find({ organization: organizationId, user: userId, createdAt: { $gte: startDate } })
        .sort({ createdAt: -1 })
        .limit(30)
        .select('productName amountCents currency status createdAt refundStatus')
        .lean(),
      Transaction.aggregate([
        { $match: { organization: organizationId, user: userId, createdAt: { $gte: startDate } } },
        { $group: { _id: { currency: '$currency', status: '$status' }, count: { $sum: 1 }, amountCents: { $sum: '$amountCents' } } },
      ]),
      AuditLog.find({
        organization: organizationId,
        user: userId,
        action: 'risk.transaction_signal',
        createdAt: { $gte: startDate },
      }).sort({ createdAt: -1 }).limit(20).select('meta.signals createdAt').lean(),
      Transaction.aggregate([
        { $match: { organization: organizationId, user: userId, createdAt: { $gte: startDate }, status: 'refunded' } },
        { $group: { _id: { productName: '$productName', currency: '$currency' }, count: { $sum: 1 }, amountCents: { $sum: '$amountCents' } } },
        { $sort: { amountCents: -1 } },
        { $limit: 20 },
      ]),
    ]);

    const result = await answerTransactionQuestionWithAI({
      question: parsed.data.question,
      summary: grouped.map((row) => ({
        currency: row._id.currency,
        status: row._id.status,
        count: row.count,
        amountCents: row.amountCents,
      })),
      recentTransactions: transactions.map((item) => ({
        productName: item.productName,
        amountCents: item.amountCents,
        currency: item.currency,
        status: item.status,
        refundStatus: item.refundStatus ?? 'not_requested',
        date: item.createdAt.toISOString(),
      })),
      riskAlerts: riskEvents.map((item) => ({
        signals: Array.isArray(item.meta?.signals) ? item.meta.signals : [],
        date: item.createdAt.toISOString(),
      })),
      refundedProducts: refundedProducts.map((item) => ({
        productName: item._id.productName,
        currency: item._id.currency,
        count: item.count,
        amountCents: item.amountCents,
      })),
    });
    res.json({
      ...result,
      basedOn: { windowDays: 90, recentRecordsIncluded: transactions.length, transactionCount: grouped.reduce((count, item) => count + item.count, 0) },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
