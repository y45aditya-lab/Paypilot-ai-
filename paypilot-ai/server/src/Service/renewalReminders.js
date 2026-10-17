import Subscription from '../models/Subscription.js';
import { createNotification } from './notifications.js';
import PurchaseRequest from '../models/PurchaseRequest.js';
import User from '../models/User.js';

export async function sendRenewalReminders() {
  const now = new Date();
  const horizon = new Date(now);
  horizon.setDate(horizon.getDate() + 30);
  const subscriptions = await Subscription.find({
    status: 'active',
    renewalDate: { $gte: now, $lte: horizon },
  }).select('_id organization user productName renewalDate').lean();
  await Promise.all(subscriptions.map((subscription) => createNotification({
    userId: subscription.user,
    organizationId: subscription.organization,
    type: 'subscription_renewal',
    title: 'Subscription renewal coming up',
    message: `${subscription.productName} is due to renew on ${subscription.renewalDate.toLocaleDateString('en-IN')}.`,
    dedupeKey: `renewal:${subscription._id}:${subscription.renewalDate.toISOString().slice(0, 10)}`,
  })));
  const overdueBefore = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const requests = await PurchaseRequest.find({
    status: { $in: ['awaiting_manager', 'awaiting_finance'] },
    updatedAt: { $lte: overdueBefore },
  }).sort({ updatedAt: 1 }).limit(200).select('_id organization requester productName status').lean();
  const today = now.toISOString().slice(0, 10);
  await Promise.all(requests.map(async (request) => {
    const roles = request.status === 'awaiting_finance' ? ['admin', 'finance'] : ['admin', 'manager'];
    const reviewers = await User.find({ organization: request.organization, role: { $in: roles } }).select('_id').lean();
    return Promise.all(reviewers.map((reviewer) => createNotification({
      userId: reviewer._id,
      organizationId: request.organization,
      type: 'approval_reminder',
      title: 'Purchase request is waiting for review',
      message: `${request.productName} has been awaiting review for more than 24 hours.`,
      dedupeKey: `approval-reminder:${request._id}:${reviewer._id}:${today}`,
    })));
  }));
  return { subscriptionReminders: subscriptions.length, approvalReminders: requests.length };
}

export function startRenewalReminderSchedule() {
  const run = () => sendRenewalReminders().catch((error) => {
    console.error('[renewals] reminder job failed:', error.message);
  });
  void run();
  const timer = setInterval(run, 24 * 60 * 60 * 1000);
  timer.unref();
  return timer;
}
