import { Router } from 'express';
import mongoose from 'mongoose';
import Subscription from '../models/Subscription.js';
import { audit } from '../Service/Audit.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const filter = { organization: req.user.organizationId };
    if (!['admin', 'manager', 'finance'].includes(req.user.role)) filter.user = req.user.id;
    if (req.query.status && !['active', 'cancelled'].includes(req.query.status)) {
      return res.status(400).json({ error: 'Status must be active or cancelled.' });
    }
    if (req.query.status) filter.status = req.query.status;
    const subscriptions = await Subscription.find(filter)
      .populate('user', 'name email')
      .sort({ renewalDate: 1 })
      .limit(200)
      .lean();
    res.json({ subscriptions });
  } catch (error) { next(error); }
});

router.patch('/:id/cancel', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Subscription not found.' });
    const filter = { _id: req.params.id, organization: req.user.organizationId, status: 'active' };
    if (!['admin', 'manager', 'finance'].includes(req.user.role)) filter.user = req.user.id;
    const subscription = await Subscription.findOneAndUpdate(filter, { status: 'cancelled' }, { new: true });
    if (!subscription) return res.status(404).json({ error: 'Active subscription not found.' });
    await audit('subscription.cancelled', {
      userId: req.user.id, organizationId: req.user.organizationId,
      meta: { subscriptionId: String(subscription._id) },
    });
    res.json({ subscription });
  } catch (error) { next(error); }
});

export default router;
