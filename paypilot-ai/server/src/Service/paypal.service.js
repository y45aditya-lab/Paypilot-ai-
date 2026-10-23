const BASE = process.env.PAYPAL_BASE_URL || 'https://api-m.sandbox.paypal.com';

export class PayPalError extends Error {
  constructor(message, { status, name, debugId } = {}) {
    super(message);
    this.status = status;
    this.name = 'PayPalError';
    this.code = name;       // e.g. INSTRUMENT_DECLINED, ORDER_NOT_APPROVED
    this.debugId = debugId; // quote this to PayPal support
  }
}

// Some failures are definitive provider rejections; others may happen after PayPal
// accepted the capture (for example, a timeout or a 5xx response). Never reopen
// an order for a new capture when the outcome is uncertain.
// Refunds need a stricter retry policy than ordinary requests: a timeout or 5xx
// may occur after PayPal has already issued the refund.
export function isDefinitivePayPalRefundFailure(error) {
  if (!(error instanceof PayPalError) || !Number.isInteger(error.status)) return false;
  return [400, 401, 403, 404].includes(error.status)
    && !['REFUND_ALREADY_PROCESSED', 'INTERNAL_SERVER_ERROR'].includes(error.code);
}

export function isDefinitivePayPalFailure(error) {
  if (!(error instanceof PayPalError) || !Number.isInteger(error.status)) return false;

  // Whitelist responses that establish the capture request was rejected. Do not
  // treat every 4xx as safe: an "already captured" response can mean money moved.
  if ([401, 403, 404].includes(error.status)) return true;
  return error.status === 422
    && ['INSTRUMENT_DECLINED', 'ORDER_NOT_APPROVED'].includes(error.code);
}

// OAuth: exchange client id + secret for a short-lived access token, cached until near expiry
let cached = { token: null, expiresAt: 0 };

async function getAccessToken() {
  if (cached.token && Date.now() < cached.expiresAt - 60_000) return cached.token;

  const { PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET } = process.env;
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    throw new Error('PayPal credentials are not configured');
  }
  const basic = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');

  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json();
  if (!res.ok) throw new PayPalError('PayPal authentication failed', { status: res.status });

  cached = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cached.token;
}

async function paypalRequest(path, { method = 'POST', body, requestId } = {}) {
  const token = await getAccessToken();
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  // PayPal remembers this key: repeating a request with the same key returns the
  // original result instead of acting twice. This is "idempotency".
  if (requestId) headers['PayPal-Request-Id'] = requestId;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const detail = data.details?.[0]?.issue || data.name;
    throw new PayPalError(data.message || 'PayPal request failed', {
      status: res.status,
      name: detail,
      debugId: data.debug_id,
    });
  }
  return data;
}

// 4999 -> "49.99". Integer math only, so no floating-point surprises.
export function centsToPayPalValue(cents) {
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new RangeError('PayPal amounts must be non-negative safe integer cents.');
  }
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

export function payPalValueToCents(value) {
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(String(value));
  if (!match) return Number.NaN;
  const cents = (BigInt(match[1]) * 100n) + BigInt((match[2] ?? '').padEnd(2, '0'));
  return cents <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(cents) : Number.NaN;
}

export function createPayPalOrder({ orderId, totalCents, currency, description }) {
  return paypalRequest('/v2/checkout/orders', {
    requestId: `create-${orderId}`, // one PayPal order per PayPilot order, even on retries
    body: {
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: String(orderId),
          custom_id: String(orderId), // ties the PayPal order back to ours (useful for webhooks)
          description: description.slice(0, 127),
          amount: { currency_code: currency, value: centsToPayPalValue(totalCents) },
        },
      ],
    },
  });
}

export function getPayPalOrder(paypalOrderId) {
  return paypalRequest(`/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}`, { method: 'GET' });
}

export function capturePayPalOrder({ paypalOrderId, orderId }) {
  return paypalRequest(`/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`, {
    requestId: `capture-${orderId}`, // a retry after a network timeout can't double-charge
  });
}

export function getPayPalRefund(refundId) {
  return paypalRequest(`/v2/payments/refunds/${encodeURIComponent(refundId)}`, { method: 'GET' });
}

export function refundPayPalCapture({ captureId, transactionId }) {
  return paypalRequest(`/v2/payments/captures/${encodeURIComponent(captureId)}/refund`, {
    requestId: `refund-${transactionId}`,
  });
}

export function verifyWebhookSignature({ headers, event }) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) throw new Error('PAYPAL_WEBHOOK_ID is not configured');

  return paypalRequest('/v1/notifications/verify-webhook-signature', {
    body: {
      auth_algo: headers['paypal-auth-algo'],
      cert_url: headers['paypal-cert-url'],
      transmission_id: headers['paypal-transmission-id'],
      transmission_sig: headers['paypal-transmission-sig'],
      transmission_time: headers['paypal-transmission-time'],
      webhook_id: webhookId,
      webhook_event: event,
    },
  }).then((data) => data.verification_status === 'SUCCESS');
}