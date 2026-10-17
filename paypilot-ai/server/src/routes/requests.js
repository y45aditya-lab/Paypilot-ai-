import { Router } from 'express';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import PurchaseRequest from '../models/PurchaseRequest.js';
import PurchaseOrder from '../models/PurchaseOrder.js';
import Product from '../models/Product.js';
import Subscription from '../models/Subscription.js';
import DepartmentBudget from '../models/DepartmentBudget.js';
import Order from '../models/Order.js';
import Organization from '../models/Organization.js';
import User from '../models/User.js';
import { buildQuote } from '../Service/validateRecommendation.js';
import { audit } from '../Service/Audit.js';
import { createNotification } from '../Service/notifications.js';
import { approvalStage, canApprovePurchase, nextApprovalStatus } from '../Service/approvalPolicy.js';
import { assessPurchaseAttemptRisk } from '../Service/riskAnalysis.js';

const router = Router();
const createSchema = z.object({
  productId: z.string().refine(mongoose.isValidObjectId),
  seats: z.number().int().min(1).max(1000),
  justification: z.string().trim().min(5).max(1000),
}).strict();
const decisionSchema = z.object({
  decision: z.enum(['approve', 'reject', 'changes_requested']),
  comment: z.string().trim().max(1000).default(''),
}).strict();
const commentSchema = z.object({ comment: z.string().trim().min(1).max(1000) }).strict();

const canSeeAll = (role) => ['admin', 'manager', 'finance'].includes(role);

function monthStartDate() {
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  return start;
}

async function committedSpendCents({ organizationId, department, currency, category, monthStart }) {
  const [row] = await PurchaseOrder.aggregate([
    {
      $match: {
        organization: new mongoose.Types.ObjectId(organizationId),
        department,
        currency,
        createdAt: { $gte: monthStart },
        ...(category !== 'all' ? { category } : {}),
        status: { $in: ['approved', 'payment_created', 'paid'] },
      },
    },
    { $group: { _id: null, total: { $sum: '$amountCents' } } },
  ]);
  return row?.total ?? 0;
}

async function reserveBudgetForApproval(request) {
  const matchingBudgets = await DepartmentBudget.find({
    organization: request.organization,
    department: request.department,
    currency: request.currency,
    active: true,
    category: { $in: ['all', request.category] },
  }).lean();
  const budget = matchingBudgets.find((item) => item.category === request.category)
    ?? matchingBudgets.find((item) => item.category === 'all');
  if (!budget) return null;
  if (request.estimatedAmountCents === 0) return budget._id;
  const spentCents = await committedSpendCents({
    organizationId: request.organization,
    department: request.department,
    currency: request.currency,
    category: budget.category,
    monthStart: monthStartDate(),
  });
  const reserved = await DepartmentBudget.updateOne(
    {
      _id: budget._id,
      organization: request.organization,
      active: true,
      $expr: {
        $lte: [
          { $add: [{ $ifNull: ['$reservedCents', 0] }, spentCents, request.estimatedAmountCents] },
          '$amountCents',
        ],
      },
    },
    { $inc: { reservedCents: request.estimatedAmountCents } },
  );
  if (reserved.modifiedCount !== 1) {
    const error = new Error('This approval would exceed the remaining department budget.');
    error.status = 422;
    throw error;
  }
  return budget._id;
}

async function releaseBudgetReservation(organizationId, budgetId, amountCents) {
  if (!budgetId || !amountCents) return;
  await DepartmentBudget.updateOne(
    { _id: budgetId, organization: organizationId, reservedCents: { $gte: amountCents } },
    { $inc: { reservedCents: -amountCents } },
  );
}

async function ensurePurchaseOrder(request) {
  let purchaseOrder;
  try {
    purchaseOrder = await PurchaseOrder.findOneAndUpdate(
      { request: request._id },
      {
        $setOnInsert: {
          organization: request.organization,
          request: request._id,
          requester: request.requester,
          department: request.department,
          product: request.product,
          category: request.category,
          productName: request.productName,
          seats: request.seats,
          unitPriceCents: request.unitPriceCents,
          amountCents: request.estimatedAmountCents,
          currency: request.currency,
          poNumber: `PP-${randomUUID().slice(0, 12).toUpperCase()}`,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    await PurchaseRequest.updateOne(
      { _id: request._id, organization: request.organization },
      { purchaseOrder: purchaseOrder._id },
    );
    const reservation = await PurchaseRequest.findOneAndUpdate(
      { _id: request._id, organization: request.organization, budgetReservationBudget: { $exists: true } },
      { $unset: { budgetReservationBudget: 1, budgetReservationCents: 1 } },
      { new: false },
    ).select('budgetReservationBudget budgetReservationCents');
    if (reservation) {
      await releaseBudgetReservation(
        request.organization, reservation.budgetReservationBudget, reservation.budgetReservationCents,
      );
    }
    return purchaseOrder;
  } catch (error) {
    if (error.code !== 11000) throw error;
    purchaseOrder = await PurchaseOrder.findOne({ request: request._id, organization: request.organization });
    if (!purchaseOrder) throw error;
    return purchaseOrder;
  }
}

router.get('/', async (req, res, next) => {
  try {
    const filter = { organization: req.user.organizationId };
    if (!canSeeAll(req.user.role)) filter.requester = req.user.id;
    if (req.query.status) {
      if (!['awaiting_manager', 'awaiting_finance', 'approved', 'rejected', 'changes_requested', 'cancelled', 'paid'].includes(req.query.status)) {
        return res.status(400).json({ error: 'Invalid request status.' });
      }
      filter.status = req.query.status;
    }
    const requests = await PurchaseRequest.find(filter)
      .populate('requester', 'name email')
      .populate('product', 'category features')
      .populate('purchaseOrder', 'poNumber status')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    res.json({ requests });
  } catch (error) { next(error); }
});

router.post('/', async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Provide a valid product, seat count, and purchase justification.' });
    const quoteResult = await buildQuote({ productId: parsed.data.productId, seats: parsed.data.seats });
    if (!quoteResult.ok) return res.status(422).json({ error: quoteResult.errors.join(' ') });
    const { quote } = quoteResult;
    const product = await Product.findOne({ _id: parsed.data.productId, active: true }).select('category').lean();
    if (!product) return res.status(404).json({ error: 'Product not found.' });

    const [activeSubscription, sameCategorySubscription] = await Promise.all([Subscription.findOne({
      organization: req.user.organizationId,
      product: quote.product.id,
      status: 'active',
    }).select('_id productName').lean(), Subscription.findOne({
      organization: req.user.organizationId,
      product: { $ne: quote.product.id },
      category: product.category,
      status: 'active',
    }).select('_id productName').lean()]);
    const existingRequest = await PurchaseRequest.findOne({
      organization: req.user.organizationId,
      product: quote.product.id,
      requester: req.user.id,
      status: { $in: ['awaiting_manager', 'awaiting_finance', 'approved'] },
    });
    if (existingRequest) {
      if (!existingRequest.duplicateWarning) {
        existingRequest.duplicateWarning = true;
        await existingRequest.save();
      }
      return res.json({ request: existingRequest, duplicateRequest: true });
    }
    const duplicate = activeSubscription || sameCategorySubscription;
    const recentRequests = await PurchaseRequest.find({
      organization: req.user.organizationId,
      requester: req.user.id,
      createdAt: { $gte: new Date(Date.now() - 10 * 60 * 1000) },
    }).select('createdAt').lean();

    const monthStart = monthStartDate();
    const [matchingBudgets, orgSettings] = await Promise.all([DepartmentBudget.find({
      organization: req.user.organizationId,
      department: req.user.department,
      currency: quote.currency,
      active: true,
      category: { $in: ['all', product.category] },
    }).lean(), Organization.findById(req.user.organizationId).select('financeApprovalThresholdCents budgetAlertPercent').lean()]);
    let budgetAlert = null;
    if (matchingBudgets.length) {
      const applicableBudget = matchingBudgets.find((budget) => budget.category === product.category)
        ?? matchingBudgets.find((budget) => budget.category === 'all');
      const spent = applicableBudget ? await committedSpendCents({
        organizationId: req.user.organizationId,
        department: req.user.department || 'General',
        currency: quote.currency,
        category: applicableBudget.category,
        monthStart,
      }) : 0;
      const projected = spent + (applicableBudget?.reservedCents ?? 0) + quote.totalCents;
      if (applicableBudget && projected > applicableBudget.amountCents) {
        return res.status(422).json({ error: 'This request would exceed the department budget.' });
      }
      if (applicableBudget) {
        if (projected >= applicableBudget.amountCents * ((orgSettings?.budgetAlertPercent ?? 80) / 100)) {
          budgetAlert = { projected, limit: applicableBudget.amountCents };
        }
      }
    }

    const request = await PurchaseRequest.create({
      organization: req.user.organizationId,
      requester: req.user.id,
      department: req.user.department || 'General',
      product: quote.product.id,
      category: product.category,
      productName: quote.product.name,
      seats: quote.seats,
      unitPriceCents: quote.unitPriceCents,
      justification: parsed.data.justification,
      estimatedAmountCents: quote.totalCents,
      currency: quote.currency,
      duplicateWarning: Boolean(duplicate),
      duplicateOf: existingRequest?._id,
      approvalHistory: [{ actor: req.user.id, action: 'submitted', toStatus: 'awaiting_manager' }],
    });
    await audit('purchase_request.submitted', {
      userId: req.user.id,
      organizationId: req.user.organizationId,
      meta: { requestId: String(request._id), amountCents: request.estimatedAmountCents, duplicateWarning: request.duplicateWarning },
    });
    const attemptSignals = assessPurchaseAttemptRisk(recentRequests.map((item) => ({
      status: 'pending_approval',
      createdAt: item.createdAt,
    })));
    for (const signal of attemptSignals) {
      await audit('risk.transaction_signal', {
        userId: req.user.id,
        organizationId: req.user.organizationId,
        meta: { requestId: String(request._id), signals: [signal] },
      });
      await createNotification({
        userId: req.user.id,
        organizationId: req.user.organizationId,
        type: 'risk_signal',
        severity: signal.severity,
        title: 'Repeated purchase attempts review signal',
        message: signal.explanation,
        dedupeKey: `risk-request:${request._id}:${signal.code}`,
      });
    }
    const managers = await User.find({
      organization: req.user.organizationId,
      role: { $in: ['admin', 'manager'] },
    }).select('_id').lean();
    await Promise.all(managers.map((manager) => createNotification({
      userId: manager._id,
      organizationId: req.user.organizationId,
      type: 'approval_request_submitted',
      title: 'Purchase request needs manager review',
      message: `${request.productName} · ${request.department} · ${quote.currency} ${(quote.totalCents / 100).toFixed(2)}/month.`,
      dedupeKey: `approval-request:${request._id}:${manager._id}`,
    })));
    if (budgetAlert) {
      const reviewers = await User.find({
        organization: req.user.organizationId,
        role: { $in: ['admin', 'manager', 'finance'] },
      }).select('_id').lean();
      await Promise.all(reviewers.map((reviewer) => createNotification({
        userId: reviewer._id,
        organizationId: req.user.organizationId,
        type: 'budget_warning',
        severity: 'medium',
        title: 'Department budget threshold reached',
        message: `${request.department} would reach ${Math.round((budgetAlert.projected / budgetAlert.limit) * 100)}% of its monthly allocation if this request is approved.`,
        dedupeKey: `budget-alert:${request._id}:${reviewer._id}`,
      })));
    }
    res.status(201).json({ request });
  } catch (error) { next(error); }
});

router.patch('/:id/decision', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Purchase request not found.' });
    const parsed = decisionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Provide a valid decision and optional comment.' });
    const request = await PurchaseRequest.findOne({ _id: req.params.id, organization: req.user.organizationId });
    if (!request) return res.status(404).json({ error: 'Purchase request not found.' });
    const stage = approvalStage(request.status);
    if (!stage || !canApprovePurchase(req.user.role, stage)) return res.status(403).json({ error: 'You are not authorized to decide this request.' });
    if (String(request.requester) === req.user.id) return res.status(403).json({ error: 'Requesters cannot approve their own purchases.' });

    const organization = await Organization.findById(req.user.organizationId).select('financeApprovalThresholdCents').lean();
    const finalStatus = nextApprovalStatus({
      status: request.status,
      decision: parsed.data.decision,
      amountCents: request.estimatedAmountCents,
      financeThresholdCents: organization?.financeApprovalThresholdCents,
    });
    const budgetReservationBudget = finalStatus === 'approved' ? await reserveBudgetForApproval(request) : null;
    let updated;
    try {
      updated = await PurchaseRequest.findOneAndUpdate(
        { _id: request._id, organization: req.user.organizationId, status: request.status },
        {
          status: finalStatus,
          ...(budgetReservationBudget ? {
            budgetReservationBudget,
            budgetReservationCents: request.estimatedAmountCents,
          } : {}),
          $push: {
            approvalHistory: {
              actor: req.user.id,
              action: parsed.data.decision,
              comment: parsed.data.comment,
              fromStatus: request.status,
              toStatus: finalStatus,
            },
          },
        },
        { new: true },
      );
    } catch (error) {
      if (budgetReservationBudget) {
        const reservationPersisted = await PurchaseRequest.exists({
          _id: request._id,
          organization: req.user.organizationId,
          budgetReservationBudget,
        });
        if (!reservationPersisted) {
          await releaseBudgetReservation(req.user.organizationId, budgetReservationBudget, request.estimatedAmountCents);
        }
      }
      throw error;
    }
    if (!updated) {
      await releaseBudgetReservation(req.user.organizationId, budgetReservationBudget, request.estimatedAmountCents);
      return res.status(409).json({ error: 'This request was already updated. Refresh and try again.' });
    }
    if (finalStatus === 'approved') await ensurePurchaseOrder(updated);
    await audit('purchase_request.decided', {
      userId: req.user.id,
      organizationId: req.user.organizationId,
      meta: { requestId: String(request._id), decision: parsed.data.decision, status: finalStatus },
    });
    await createNotification({
      userId: request.requester,
      organizationId: req.user.organizationId,
      type: finalStatus === 'approved' || finalStatus === 'awaiting_finance' ? 'approval_updated' : 'approval_decision',
      title: finalStatus === 'approved' ? 'Purchase approved' : 'Purchase request updated',
      message: `${request.productName}: ${finalStatus.replaceAll('_', ' ')}${parsed.data.comment ? ` — ${parsed.data.comment}` : ''}`,
      dedupeKey: `request-decision:${request._id}:${updated.updatedAt.getTime()}`,
    });
    if (finalStatus === 'awaiting_finance') {
      const financeReviewers = await User.find({
        organization: req.user.organizationId,
        role: { $in: ['admin', 'finance'] },
      }).select('_id').lean();
      await Promise.all(financeReviewers.map((reviewer) => createNotification({
        userId: reviewer._id,
        organizationId: req.user.organizationId,
        type: 'approval_finance_review',
        title: 'Purchase request needs finance review',
        message: `${request.productName} exceeds the finance approval threshold.`,
        dedupeKey: `approval-finance:${request._id}:${reviewer._id}`,
      })));
    }
    res.json({ request: updated });
  } catch (error) { next(error); }
});

router.post('/:id/comments', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Purchase request not found.' });
    const parsed = commentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Comment must contain 1-1000 characters.' });
    const filter = { _id: req.params.id, organization: req.user.organizationId };
    if (!canSeeAll(req.user.role)) filter.requester = req.user.id;
    const request = await PurchaseRequest.findOneAndUpdate(
      filter,
      { $push: { comments: { actor: req.user.id, action: 'comment', comment: parsed.data.comment } } },
      { new: true },
    );
    if (!request) return res.status(404).json({ error: 'Purchase request not found.' });
    await audit('purchase_request.comment_added', {
      userId: req.user.id,
      organizationId: req.user.organizationId,
      meta: { requestId: String(request._id) },
    });
    res.status(201).json({ request });
  } catch (error) { next(error); }
});

router.post('/:id/order', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Purchase request not found.' });
    const filter = { _id: req.params.id, organization: req.user.organizationId, status: 'approved', requester: req.user.id };
    const request = await PurchaseRequest.findOne(filter);
    if (!request) return res.status(404).json({ error: 'Only the requester can start checkout for an approved request.' });
    const po = await ensurePurchaseOrder(request);
    let order;
    try {
      order = await Order.findOneAndUpdate(
        { purchaseRequest: request._id },
        {
          $setOnInsert: {
            organization: req.user.organizationId,
            user: request.requester,
            purchaseRequest: request._id,
            product: request.product,
            category: request.category,
            productName: request.productName,
            seats: request.seats,
            unitPriceCents: request.unitPriceCents,
            department: request.department,
            totalCents: request.estimatedAmountCents,
            currency: request.currency,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
    } catch (error) {
      if (error.code !== 11000) throw error;
      order = await Order.findOne({ purchaseRequest: request._id, organization: req.user.organizationId });
      if (!order) throw error;
    }
    await PurchaseRequest.updateOne({ _id: request._id }, { order: order._id, purchaseOrder: po._id });
    res.status(201).json({ order });
  } catch (error) { next(error); }
});

export default router;
