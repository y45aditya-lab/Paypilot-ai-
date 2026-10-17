import AuditLog from '../models/Auditlog.js';
import User from '../models/User.js';

// Auditing must never break a payment, so failures are logged, not thrown.
export async function audit(action, { userId, organizationId, orderId, meta } = {}) {
  try {
    const organization = organizationId
      ?? (userId ? await User.findById(userId).select('organization').then((user) => user?.organization) : undefined);
    await AuditLog.create({ action, user: userId, organization, order: orderId, meta });
  } catch (err) {
    console.error('[audit] failed to write', action, err.message);
  }
}