const baseUrl =
  process.env.PAYPAL_BASE_URL ||
  "https://api-m.sandbox.paypal.com";

async function getAccessToken() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;

  if (!clientId || !secret) {
    throw new Error("PayPal credentials are missing");
  }

  const credentials = Buffer.from(
    `${clientId}:${secret}`
  ).toString("base64");

  const response = await fetch(
    `${baseUrl}/v1/oauth2/token`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: "grant_type=client_credentials"
    }
  );

  const data = await response.json();

  if (!response.ok || !data.access_token) {
    throw new Error("Unable to authenticate with PayPal");
  }

  return data.access_token;
}

async function paypalRequest(path, options = {}) {
  const token = await getAccessToken();

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(
      data.message || "PayPal API request failed"
    );
    error.status = response.status;
    throw error;
  }

  return data;
}

export function createPayPalOrder({
  paymentId,
  amount,
  currency
}) {
  return paypalRequest("/v2/checkout/orders", {
    method: "POST",
    headers: {
      "PayPal-Request-Id": `create-${paymentId}`
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          custom_id: String(paymentId),
          amount: {
            currency_code: currency,
            value: amount
          }
        }
      ]
    })
  });
}

export function getPayPalOrder(orderId) {
  return paypalRequest(
    `/v2/checkout/orders/${encodeURIComponent(orderId)}`,
    { method: "GET" }
  );
}

export function capturePayPalOrder(orderId, paymentId) {
  return paypalRequest(
    `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
    {
      method: "POST",
      headers: {
        "PayPal-Request-Id": `capture-${paymentId}`
      },
      body: "{}"
    }
  );
}