import { verifyToken } from '../Utils/Token.js';

import mongoose from 'mongoose';
import User from '../models/User.js';

export function requireAuth(req, res, next) {
  const [scheme, token] = (req.headers.authorization ?? '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const payload = verifyToken(token);
    if (!mongoose.isValidObjectId(payload.sub)) return res.status(401).json({ error: 'Invalid or expired token' });
    User.findById(payload.sub).select('organization role department notificationPreferences email')
      .then((user) => {
        if (!user?.organization) return res.status(401).json({ error: 'Account is not assigned to an organization' });
        req.user = {
          id: String(user._id),
          organizationId: String(user.organization),
          role: user.role,
          department: user.department,
          notificationPreferences: user.notificationPreferences,
          email: user.email,
          isPlatformAdmin: Boolean(process.env.PLATFORM_ADMIN_EMAIL)
            && user.email === process.env.PLATFORM_ADMIN_EMAIL.trim().toLowerCase(),
        };
        next();
      })
      .catch(next);
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}