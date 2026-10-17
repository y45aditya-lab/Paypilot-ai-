import { Router } from 'express';
import mongoose from 'mongoose';
import Notification from '../models/Notification.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const [items, unread] = await Promise.all([
      Notification.find({ organization: req.user.organizationId, user: req.user.id }).sort({ createdAt: -1 }).limit(30).lean(),
      Notification.countDocuments({ organization: req.user.organizationId, user: req.user.id, readAt: null }),
    ]);
    res.json({ items, unread });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/read', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Notification not found' });
    const item = await Notification.findOneAndUpdate(
      { _id: req.params.id, organization: req.user.organizationId, user: req.user.id, readAt: null },
      { readAt: new Date() },
      { new: true },
    );
    if (!item) {
      const existing = await Notification.findOne({ _id: req.params.id, organization: req.user.organizationId, user: req.user.id }).lean();
      if (!existing) return res.status(404).json({ error: 'Notification not found' });
      return res.json({ item: existing });
    }
    res.json({ item });
  } catch (err) {
    next(err);
  }
});

export default router;
