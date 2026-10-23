import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import Product from '../models/Product.js';
import Vendor from '../models/Vendor.js';
import VendorOffer from '../models/VendorOffer.js';
import AuditLog from '../models/Auditlog.js';
import Organization from '../models/Organization.js';
import OrganizationInvite from '../models/OrganizationInvite.js';
import DepartmentBudget from '../models/DepartmentBudget.js';
import User from '../models/User.js';
import OutboxEvent from '../models/OutboxEvent.js';
import { createHash, randomBytes } from 'node:crypto';
import { validate } from '../middleware/validate.js';
import { audit } from '../Service/Audit.js';

const router = Router(); // mounted behind requireAuth AND requireRole('admin')

const baseSchema = z.object({
  name: z.string().trim().min(2).max(80),
  category: z.enum(['project-management', 'crm', 'design', 'communication', 'accounting']),
  description: z.string().trim().min(5).max(500),
  features: z.array(z.string().trim().min(1).max(80)).max(10).default([]),
  unitPriceCents: z.number().int().min(0).max(10_000_000),
  pricingModel: z.enum(['per_seat', 'flat']),
  minSeats: z.number().int().min(1).default(1),
  maxSeats: z.number().int().min(1).max(10000).default(10000),
  active: z.boolean().default(true),
}).strict(); // unknown fields are rejected, not silently ignored

const createSchema = baseSchema.refine((p) => p.minSeats <= p.maxSeats, {
  message: 'minSeats must be less than or equal to maxSeats',
});
const patchSchema = baseSchema.partial();
const vendorSchema = z.object({
  name: z.string().trim().min(2).max(100),
  contactEmail: z.union([z.string().trim().email().max(254), z.literal('')]).optional(),
  website: z.union([
    z.string().url().max(300).refine((value) => new URL(value).protocol === 'https:'),
    z.literal(''),
  ]).optional(),
  notes: z.string().trim().max(500).optional(),
  active: z.boolean().optional(),
}).strict();
const offerSchema = z.object({
  productId: z.string().min(1),
  vendorId: z.string().min(1),
  priceCents: z.number().int().min(0).max(10_000_000),
  currency: z.string().length(3).default('INR'),
  stockQuantity: z.number().int().min(0).max(1_000_000),
  active: z.boolean().default(true),
}).strict();
const offerPatchSchema = offerSchema.omit({ productId: true, vendorId: true }).partial();

const notFound = (res) => res.status(404).json({ error: 'Product not found' });

router.get('/organization', async (req, res, next) => {
  try {
    const [organization, members] = await Promise.all([
      Organization.findById(req.user.organizationId).lean(),
      User.find({ organization: req.user.organizationId }).select('name email role department createdAt').sort({ name: 1 }).lean(),
    ]);
    if (!organization) return res.status(404).json({ error: 'Organization not found.' });
    res.json({ organization, members });
  } catch (error) { next(error); }
});

router.patch('/organization', async (req, res, next) => {
  try {
    const schema = z.object({
      name: z.string().trim().min(2).max(100).optional(),
      financeApprovalThresholdCents: z.number().int().min(0).max(100_000_000).optional(),
      budgetAlertPercent: z.number().int().min(1).max(100).optional(),
      policyText: z.string().max(20_000).optional(),
      departments: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
    }).strict();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Organization settings are invalid.' });
    const organization = await Organization.findByIdAndUpdate(
      req.user.organizationId, { $set: parsed.data }, { new: true, runValidators: true },
    );
    await audit('organization.settings_updated', {
      userId: req.user.id,
      organizationId: req.user.organizationId,
      meta: { fields: Object.keys(parsed.data) },
    });
    res.json({ organization });
  } catch (error) { next(error); }
});

router.post('/organization/policy-answer', async (req, res, next) => {
  try {
    const parsed = z.object({ question: z.string().trim().min(5).max(1000) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Question must contain 5-1000 characters.' });
    const organization = await Organization.findById(req.user.organizationId).select('policyText').lean();
    const terms = parsed.data.question.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];
    const evidence = (organization?.policyText ?? '').split(/(?<=[.!?])\s+|\r?\n/)
      .map((text) => text.trim()).filter(Boolean)
      .map((text) => ({ text, score: terms.reduce((n, term) => n + (text.toLowerCase().includes(term) ? 1 : 0), 0) }))
      .filter((item) => item.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);
    res.json({
      answer: evidence.length
        ? evidence.map((item) => item.text).join(' ')
        : 'The approved policy text does not contain enough information to answer. Ask your procurement administrator.',
      evidence: evidence.map(({ text }) => text),
      mode: 'local-policy-search',
    });
  } catch (error) { next(error); }
});

router.get('/budgets', async (req, res, next) => {
  try {
    const budgets = await DepartmentBudget.find({ organization: req.user.organizationId }).sort({ department: 1, category: 1 }).lean();
    res.json({ budgets });
  } catch (error) { next(error); }
});

router.put('/budgets', async (req, res, next) => {
  try {
    const schema = z.object({
      department: z.string().trim().min(1).max(80),
      category: z.string().trim().min(1).max(80).default('all'),
      amountCents: z.number().int().min(0).max(1_000_000_000),
      currency: z.string().length(3).default('INR'),
      active: z.boolean().default(true),
    }).strict();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Budget details are invalid.' });
    const organization = await Organization.findById(req.user.organizationId).select('departments').lean();
    if (!organization?.departments.includes(parsed.data.department)) {
      return res.status(400).json({ error: 'Department must be configured for this organization.' });
    }
    const budget = await DepartmentBudget.findOneAndUpdate(
      {
        organization: req.user.organizationId,
        department: parsed.data.department,
        category: parsed.data.category,
        currency: parsed.data.currency,
      },
      { $set: { ...parsed.data, organization: req.user.organizationId, period: 'monthly' } },
      { upsert: true, new: true, runValidators: true },
    );
    await audit('organization.budget_updated', {
      userId: req.user.id, organizationId: req.user.organizationId,
      meta: { department: budget.department, category: budget.category, amountCents: budget.amountCents, currency: budget.currency },
    });
    res.json({ budget });
  } catch (error) { next(error); }
});

router.post('/invites', async (req, res, next) => {
  try {
    const parsed = z.object({
      email: z.string().trim().toLowerCase().email().max(254),
      role: z.enum(['manager', 'finance', 'employee']),
      department: z.string().trim().min(1).max(80).default('General'),
    }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invitation details are invalid.' });
    const organization = await Organization.findById(req.user.organizationId).select('departments').lean();
    if (!(organization?.departments ?? []).includes(parsed.data.department)) {
      return res.status(400).json({ error: 'Department must be configured for this organization.' });
    }
    if (await User.exists({ email: parsed.data.email })) return res.status(409).json({ error: 'This email already has an account.' });
    const token = randomBytes(32).toString('base64url');
    const invite = await OrganizationInvite.create({
      organization: req.user.organizationId,
      email: parsed.data.email,
      role: parsed.data.role,
      department: parsed.data.department,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      invitedBy: req.user.id,
    });
    await audit('organization.member_invited', {
      userId: req.user.id, organizationId: req.user.organizationId,
      meta: { inviteId: String(invite._id), role: invite.role },
    });
    res.status(201).json({
      invitation: {
        email: invite.email,
        role: invite.role,
        department: invite.department,
        expiresAt: invite.expiresAt,
        token,
      },
    });
  } catch (error) { next(error); }
});

router.get('/vendors', async (req, res, next) => {
  try {
    const vendors = await Vendor.find({ organization: req.user.organizationId }).sort({ name: 1 }).lean();
    res.json({ vendors });
  } catch (err) { next(err); }
});

router.post('/vendors', validate(vendorSchema), async (req, res, next) => {
  try {
    const vendor = await Vendor.create({ ...req.body, organization: req.user.organizationId });
    await audit('admin.vendor_created', { userId: req.user.id, meta: { vendorId: String(vendor._id) } });
    res.status(201).json({ vendor });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'A vendor with this name already exists.' });
    next(err);
  }
});

router.patch('/vendors/:id', validate(vendorSchema.partial()), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Vendor not found' });
    const vendor = await Vendor.findOneAndUpdate(
      { _id: req.params.id, organization: req.user.organizationId }, req.body, { new: true, runValidators: true },
    );
    if (!vendor) return res.status(404).json({ error: 'Vendor not found' });
    await audit('admin.vendor_updated', { userId: req.user.id, meta: { vendorId: String(vendor._id), fields: Object.keys(req.body) } });
    res.json({ vendor });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'A vendor with this name already exists.' });
    next(err);
  }
});

router.get('/offers', async (req, res, next) => {
  try {
    const offers = await VendorOffer.find({ organization: req.user.organizationId })
      .populate('product', 'name category unitPriceCents currency')
      .populate('vendor', 'name website active')
      .sort({ updatedAt: -1 })
      .lean();
    res.json({ offers });
  } catch (err) { next(err); }
});

router.post('/offers', validate(offerSchema), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.body.productId) || !mongoose.isValidObjectId(req.body.vendorId)) {
      return res.status(400).json({ error: 'A valid product and vendor are required.' });
    }
    const [product, vendor] = await Promise.all([
      Product.findOne({ _id: req.body.productId, active: true }).select('currency'),
      Vendor.findOne({ _id: req.body.vendorId, organization: req.user.organizationId, active: true }).select('_id'),
    ]);
    if (!product) return res.status(404).json({ error: 'Active product not found.' });
    if (!vendor) return res.status(404).json({ error: 'Active vendor not found.' });
    if (product.currency !== req.body.currency) {
      return res.status(400).json({ error: 'Vendor offer currency must match the product currency.' });
    }
    const offer = await VendorOffer.create({
      ...req.body,
      organization: req.user.organizationId,
      product: req.body.productId,
      vendor: req.body.vendorId,
    });
    await audit('admin.vendor_offer_created', { userId: req.user.id, meta: { offerId: String(offer._id) } });
    res.status(201).json({ offer });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'This vendor already has an offer for the product.' });
    next(err);
  }
});

router.patch('/offers/:id', validate(offerPatchSchema), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Vendor offer not found' });
    const offer = await VendorOffer.findOne({ _id: req.params.id, organization: req.user.organizationId });
    if (!offer) return res.status(404).json({ error: 'Vendor offer not found' });
    if (req.body.currency && req.body.currency !== offer.currency) {
      return res.status(400).json({ error: 'Vendor offer currency cannot be changed.' });
    }
    Object.assign(offer, req.body);
    await offer.save();
    await audit('admin.vendor_offer_updated', { userId: req.user.id, meta: { offerId: String(offer._id), fields: Object.keys(req.body) } });
    res.json({ offer });
  } catch (err) { next(err); }
});

router.delete('/offers/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Vendor offer not found' });
    const offer = await VendorOffer.findOneAndUpdate(
      { _id: req.params.id, organization: req.user.organizationId }, { active: false }, { new: true },
    );
    if (!offer) return res.status(404).json({ error: 'Vendor offer not found' });
    await audit('admin.vendor_offer_deactivated', { userId: req.user.id, meta: { offerId: String(offer._id) } });
    res.json({ offer });
  } catch (err) { next(err); }
});

router.get('/products', async (_req, res, next) => {
  try {
    res.json({ products: await Product.find().sort({ createdAt: -1 }).lean() });
  } catch (err) { next(err); }
});

router.post('/products', validate(createSchema), async (req, res, next) => {
  try {
    if (!req.user.isPlatformAdmin) return res.status(403).json({ error: 'Only the configured platform administrator can edit the shared product catalog.' });
    const product = await Product.create(req.body);
    await audit('admin.product_created', { userId: req.user.id, meta: { productId: String(product._id) } });
    res.status(201).json({ product });
  } catch (err) { next(err); }
});

router.patch('/products/:id', validate(patchSchema), async (req, res, next) => {
  try {
    if (!req.user.isPlatformAdmin) return res.status(403).json({ error: 'Only the configured platform administrator can edit the shared product catalog.' });
    if (!mongoose.isValidObjectId(req.params.id)) return notFound(res);
    const product = await Product.findById(req.params.id);
    if (!product) return notFound(res);

    Object.assign(product, req.body);
    if (product.minSeats > product.maxSeats) {
      return res.status(400).json({ error: 'minSeats must be less than or equal to maxSeats' });
    }
    await product.save();

    // Price changes affect FUTURE orders only: existing orders hold their own snapshot
    await audit('admin.product_updated', {
      userId: req.user.id,
      meta: { productId: String(product._id), fields: Object.keys(req.body) },
    });
    res.json({ product });
  } catch (err) { next(err); }
});

// Soft delete: old orders still reference the product, so we never remove the document
router.delete('/products/:id', async (req, res, next) => {
  try {
    if (!req.user.isPlatformAdmin) return res.status(403).json({ error: 'Only the configured platform administrator can edit the shared product catalog.' });
    if (!mongoose.isValidObjectId(req.params.id)) return notFound(res);
    const product = await Product.findByIdAndUpdate(req.params.id, { active: false }, { new: true });
    if (!product) return notFound(res);
    await audit('admin.product_deactivated', { userId: req.user.id, meta: { productId: String(product._id) } });
    res.json({ product });
  } catch (err) { next(err); }
});

// The payments a human needs to look at (from Day 5's webhook and capture checks)
const REVIEW_ACTIONS = [
  'webhook.needs_review', 'webhook.amount_mismatch',
  'webhook.order_mismatch', 'webhook.capture_denied',
  'capture.amount_mismatch', 'capture.duplicate_capture_mismatch', 'capture.needs_review',
  'refund.amount_mismatch', 'refund.needs_review', 'risk.transaction_signal',
];
router.get('/review', async (req, res, next) => {
  try {
    const items = await AuditLog.find({ organization: req.user.organizationId, action: { $in: REVIEW_ACTIONS } })
      .sort({ createdAt: -1 }).limit(50).lean();
    res.json({ items });
  } catch (err) { next(err); }
});

// Dead-letter outbox events are visible only to admins in the same organization.
// Payloads and processing ownership tokens are intentionally never returned.
router.get('/outbox/dead', async (req, res, next) => {
  try {
    const events = await OutboxEvent.find({
      status: 'dead',
      'payload.organizationId': String(req.user.organizationId),
    }).sort({ updatedAt: -1 }).limit(100).lean();

    res.json({
      events: events.map((event) => ({
        id: String(event._id),
        eventType: event.eventType,
        status: event.status,
        attempts: event.attempts,
        lastError: event.lastError ?? null,
        createdAt: event.createdAt,
        updatedAt: event.updatedAt,
        orderId: event.payload?.orderId ? String(event.payload.orderId) : null,
      })),
    });
  } catch (error) { next(error); }
});

router.post('/outbox/:id/retry', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ error: 'Outbox event not found.' });
    }
    const event = await OutboxEvent.findOneAndUpdate(
      {
        _id: req.params.id,
        status: 'dead',
        manualRetries: { $lt: 3 },
        'payload.organizationId': String(req.user.organizationId),
      },
      {
        $set: {
          status: 'pending',
          attempts: 0,
          availableAt: new Date(),
          processingToken: null,
          lastError: null,
        },
        $unset: { processedAt: 1 },
        $inc: { manualRetries: 1 },
      },
      { new: true },
    ).select('_id eventType status attempts manualRetries');

    if (!event) {
      const deadEvent = await OutboxEvent.exists({
        _id: req.params.id,
        status: 'dead',
        'payload.organizationId': String(req.user.organizationId),
      });
      if (deadEvent) return res.status(409).json({ error: 'Manual retry limit reached for this event.' });
      return res.status(404).json({ error: 'Dead outbox event not found.' });
    }

    await audit('outbox.dead_event_retried', {
      userId: req.user.id,
      organizationId: req.user.organizationId,
      meta: { eventId: String(event._id), eventType: event.eventType, manualRetries: event.manualRetries },
    });
    res.json({
      message: 'Outbox event queued for retry.',
      event: {
        id: String(event._id),
        eventType: event.eventType,
        status: event.status,
        attempts: event.attempts,
        manualRetries: event.manualRetries,
      },
    });
  } catch (error) { next(error); }
});

export default router;