import { createHmac } from 'node:crypto';
import Notification from '../models/Notification.js';
import User from '../models/User.js';

async function deliverIntegrationEvent(item) {
  const endpoint = process.env.PAYPILOT_EVENTS_WEBHOOK_URL;
  const secret = process.env.PAYPILOT_EVENTS_WEBHOOK_SECRET;
  if (!endpoint && !secret) return;
  if (!endpoint || !secret || secret.length < 32) {
    console.error('[integration] webhook requires an HTTPS URL and a secret of at least 32 characters');
    return;
  }

  let url;
  try {
    url = new URL(endpoint);
  } catch {
    console.error('[integration] webhook URL is invalid');
    return;
  }
  if (url.protocol !== 'https:') {
    console.error('[integration] webhook URL must use HTTPS');
    return;
  }

  const body = JSON.stringify({
    id: String(item._id),
    type: item.type,
    severity: item.severity,
    title: item.title,
    message: item.message,
    createdAt: item.createdAt,
  });
  const signature = createHmac('sha256', secret).update(body).digest('hex');
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-PayPilot-Event': item.type,
        'X-PayPilot-Signature': `sha256=${signature}`,
      },
      body,
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) console.error('[integration] webhook delivery returned HTTP', response.status);
  } catch (error) {
    console.error('[integration] webhook delivery failed:', error.message);
  }
}

export async function createNotification({
  userId,
  organizationId,
  type,
  severity = 'info',
  title,
  message,
  orderId,
  transactionId,
  dedupeKey,
}) {
  try {
    const user = await User.findById(userId).select('organization notificationPreferences email');
    if (!user) throw new Error('Notification recipient no longer exists.');
    const organization = organizationId ?? user.organization;
    const preferenceKey = type.startsWith('payment_') || type.startsWith('refund_') ? 'payment'
      : type.startsWith('approval_') ? 'approvals'
        : type.startsWith('budget_') || type.startsWith('subscription_') ? 'budget'
          : type.startsWith('risk_') || type.includes('review') ? 'risk' : null;
    if (preferenceKey && user.notificationPreferences?.[preferenceKey] === false) return null;
    const item = await Notification.create({
      user: userId,
      organization,
      type,
      severity,
      title,
      message,
      order: orderId,
      transaction: transactionId,
      dedupeKey,
    });
    void deliverIntegrationEvent(item);
    if (user.notificationPreferences?.email !== false) {
      void deliverEmailNotification(item, user.email).catch((error) => {
        console.error('[email] notification setup failed:', error.message);
        return Notification.updateOne({ _id: item._id }, { emailError: error.message.slice(0, 200) })
          .catch((writeError) => console.error('[email] could not store delivery error:', writeError.message));
      });
    }
    return item;
  } catch (error) {
    if (error.code === 11000) return null;
    console.error('[notification] failed to persist notification:', error.message);
    return null;
  }

  async function deliverEmailNotification(item, recipient) {
    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM } = process.env;
    if (!SMTP_HOST && !SMTP_USER && !SMTP_PASSWORD && !SMTP_FROM) return;
    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD || !SMTP_FROM) {
      console.error('[email] SMTP requires host, user, password, and sender address');
      return;
    }
    const nodemailer = await import('nodemailer');
    const port = Number(SMTP_PORT || 587);
    const transport = nodemailer.createTransport({
      host: SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 8000,
    });
    try {
      await transport.sendMail({
        from: SMTP_FROM,
        to: recipient,
        subject: `[PayPilot] ${item.title}`,
        text: `${item.message}\n\nSign in to PayPilot to review this notification.`,
      });
      await Notification.updateOne({ _id: item._id }, { emailSentAt: new Date(), emailError: null });
    } catch (error) {
      console.error('[email] notification delivery failed:', error.message);
      await Notification.updateOne({ _id: item._id }, { emailError: error.message.slice(0, 200) });
    } finally {
      transport.close();
    }
  }
}
