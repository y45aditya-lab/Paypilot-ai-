import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import Transaction from '../models/Transaction.js';
import AuditLog from '../models/Auditlog.js';
import Order from '../models/Order.js';
import PurchaseOrder from '../models/PurchaseOrder.js';
import DepartmentBudget from '../models/DepartmentBudget.js';

const router = Router();
const querySchema = z.object({ days: z.coerce.number().int().min(7).max(365).default(30) });

router.get('/departments', async (req, res, next) => {
  try {
    if (!['admin', 'finance'].includes(req.user.role)) return res.status(403).json({ error: 'Finance or admin permission required.' });
    const startDate = new Date();
    startDate.setDate(1);
    startDate.setHours(0, 0, 0, 0);
    const organization = new mongoose.Types.ObjectId(req.user.organizationId);
    const [rows, budgets] = await Promise.all([
      PurchaseOrder.aggregate([
        { $match: { organization, createdAt: { $gte: startDate }, status: { $in: ['approved', 'payment_created', 'paid'] } } },
        {
          $group: {
            _id: { department: '$department', currency: '$currency' },
            committedCents: { $sum: '$amountCents' },
            paidCents: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, '$amountCents', 0] } },
            purchaseOrders: { $sum: 1 },
          },
        },
        { $sort: { '_id.department': 1, '_id.currency': 1 } },
      ]),
      DepartmentBudget.find({ organization, active: true, category: 'all' }).select('department currency amountCents').lean(),
    ]);
    const result = rows.map((row) => {
      const budget = budgets.find((item) => item.department === row._id.department && item.currency === row._id.currency);
      return {
        department: row._id.department,
        currency: row._id.currency,
        committedCents: row.committedCents,
        paidCents: row.paidCents,
        purchaseOrders: row.purchaseOrders,
        budgetCents: budget?.amountCents ?? null,
        remainingCents: budget ? budget.amountCents - row.committedCents : null,
      };
    });
    res.json({ monthStartsAt: startDate, departments: result });
  } catch (error) { next(error); }
});

router.get('/', async (req, res, next) => {
  try {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: 'days must be between 7 and 365' });
    const { days } = parsed.data;
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const organizationId = new mongoose.Types.ObjectId(req.user.organizationId);
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const match = { organization: organizationId, user: userId, createdAt: { $gte: startDate } };

    const [statusRows, orderStatuses, trend, products, riskAlerts] = await Promise.all([
      Transaction.aggregate([
        { $match: match },
        { $group: { _id: { currency: '$currency', status: '$status', refundStatus: '$refundStatus' }, count: { $sum: 1 }, amountCents: { $sum: '$amountCents' } } },
        { $sort: { '_id.currency': 1, '_id.status': 1 } },
      ]),
      Order.aggregate([
        { $match: match },
        { $group: { _id: '$status', count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      Transaction.aggregate([
        { $match: { ...match, status: { $in: ['completed', 'refunded'] } } },
        { $group: {
          _id: { day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, currency: '$currency', status: '$status' },
          count: { $sum: 1 },
          amountCents: { $sum: '$amountCents' },
        } },
        { $sort: { '_id.day': 1 } },
      ]),
      Transaction.aggregate([
        { $match: { ...match, status: { $in: ['completed', 'refunded'] } } },
        { $group: { _id: { name: '$productName', currency: '$currency' }, count: { $sum: 1 }, amountCents: { $sum: '$amountCents' } } },
        { $sort: { amountCents: -1 } },
        { $limit: 5 },
      ]),
      AuditLog.find({
        organization: organizationId,
        user: userId,
        action: 'risk.transaction_signal',
        createdAt: { $gte: startDate },
      }).sort({ createdAt: -1 }).limit(20).select('order meta createdAt').lean(),
    ]);

    const summary = {};
    for (const row of statusRows) {
      const currency = row._id.currency;
      summary[currency] ??= { currency, completedCount: 0, refundedCount: 0, failedCount: 0, pendingCount: 0, refundReviewCount: 0, grossCents: 0, refundedCents: 0 };
      const item = summary[currency];
      if (row._id.refundStatus === 'review_required') item.refundReviewCount += row.count;
      if (row._id.status === 'completed') {
        item.completedCount += row.count;
        item.grossCents += row.amountCents;
      } else if (row._id.status === 'refunded') {
        item.refundedCount += row.count;
        item.grossCents += row.amountCents;
        item.refundedCents += row.amountCents;
      } else if (row._id.status === 'failed') item.failedCount += row.count;
      else if (row._id.status === 'pending') item.pendingCount += row.count;
    }
    for (const item of Object.values(summary)) {
      item.netCents = item.refundReviewCount > 0 ? null : item.grossCents - item.refundedCents;
    }

    res.json({
      days,
      startDate,
      generatedAt: new Date(),
      summary: Object.values(summary),
      orderStatuses: orderStatuses.map((row) => ({ status: row._id, count: row.count })),
      trend: trend.map((row) => ({ day: row._id.day, currency: row._id.currency, status: row._id.status, count: row.count, amountCents: row.amountCents })),
      topProducts: products.map((row) => ({ productName: row._id.name, currency: row._id.currency, count: row.count, amountCents: row.amountCents })),
      riskAlerts: riskAlerts.map((row) => ({
        orderId: row.order,
        signals: Array.isArray(row.meta?.signals) ? row.meta.signals : [],
        createdAt: row.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
