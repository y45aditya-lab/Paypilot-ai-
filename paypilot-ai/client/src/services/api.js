const API = import.meta.env.VITE_API_URL || '/api';

// The access token lives ONLY in this variable: not localStorage, not a cookie.
// A page reload clears it, and the refresh cookie silently gets a new one.
let accessToken = null;
export const setAccessToken = (token) => { accessToken = token; };

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

// ONE refresh at a time. Without this, two parallel calls (React StrictMode runs
// effects twice in dev!) would both spend the same refresh token, and the server
// would read the second as theft and end the session.
let refreshing = null;
export function refreshSession() {
  if (!refreshing) {
    refreshing = fetch(`${API}/auth/refresh`, { method: 'POST', credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) return null;
        const data = await res.json();
        accessToken = data.accessToken;
        return data; // { accessToken, user }
      })
      .catch(() => null)
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

async function apiFetch(path, { method = 'GET', body, formData, auth = true } = {}) {
  const send = () =>
    fetch(`${API}${path}`, {
      method,
      credentials: 'include',
      headers: {
        ...(body && { 'Content-Type': 'application/json' }),
        ...(accessToken && { Authorization: `Bearer ${accessToken}` }), // read at call time, so retries use the new token
      },
      body: formData ?? (body ? JSON.stringify(body) : undefined),
    });

  let res;
  try {
    res = await send();
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(
        `Cannot reach the PayPilot API at ${API}. Check that the server is running.`,
        { cause: error },
      );
    }
    throw error;
  }

  // Expired access token: refresh once, then retry the same request.
  // A 401 is returned BEFORE the server acts, so retrying can't repeat a payment.
  if (res.status === 401 && auth) {
    const session = await refreshSession();
    if (session) res = await send();
    else onUnauthorized();
  }

  let data = null;
  const responseText = await res.text();
  if (responseText) {
    try {
      data = JSON.parse(responseText);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const statusMessage = res.status >= 500
      ? `The server could not complete the request (${res.status}). Please try again or contact support.`
      : `Request failed (${res.status}).`;
    const err = new Error(data?.error || data?.message || statusMessage);
    err.code = data?.code;
    err.status = res.status;
    throw err;
  }
  return data;
}

// auth: false = a 401 here means "wrong password", not "token expired"
export const signup = (payload) => apiFetch('/auth/signup', { method: 'POST', body: payload, auth: false });
export const acceptInvite = (payload) => apiFetch('/auth/accept-invite', { method: 'POST', body: payload, auth: false });
export const login = (payload) => apiFetch('/auth/login', { method: 'POST', body: payload, auth: false });
export const logout = () => apiFetch('/auth/logout', { method: 'POST', auth: false });
export const getMe = () => apiFetch('/auth/me');
export const updateNotificationPreferences = (preferences) =>
  apiFetch('/auth/preferences', { method: 'PATCH', body: preferences });
export const getProducts = () => apiFetch('/products');

export const requestRecommendation = ({ message, budgetInr, seats, category }) =>
  apiFetch('/recommendations', { method: 'POST', body: { message, budgetInr, seats, category } });

export const createOrder = ({ productId, seats }) =>
  apiFetch('/orders', { method: 'POST', body: { productId, seats } });
export const createPurchaseRequest = ({ productId, seats, justification }) =>
  apiFetch('/requests', { method: 'POST', body: { productId, seats, justification } });
export const getPurchaseRequests = () => apiFetch('/requests');
export const decidePurchaseRequest = (requestId, decision, comment = '') =>
  apiFetch(`/requests/${encodeURIComponent(requestId)}/decision`, { method: 'PATCH', body: { decision, comment } });
export const addPurchaseRequestComment = (requestId, comment) =>
  apiFetch(`/requests/${encodeURIComponent(requestId)}/comments`, { method: 'POST', body: { comment } });
export const createApprovedPurchaseOrder = (requestId) =>
  apiFetch(`/requests/${encodeURIComponent(requestId)}/order`, { method: 'POST' });
export const getOrganizationSettings = () => apiFetch('/admin/organization');
export const updateOrganizationSettings = (settings) => apiFetch('/admin/organization', { method: 'PATCH', body: settings });
export const askPolicyQuestion = (question) => apiFetch('/admin/organization/policy-answer', { method: 'POST', body: { question } });
export const getBudgets = () => apiFetch('/admin/budgets');
export const saveBudget = (budget) => apiFetch('/admin/budgets', { method: 'PUT', body: budget });
export const inviteMember = (payload) => apiFetch('/admin/invites', { method: 'POST', body: payload });
export const uploadInvoice = async (file) => {
  const form = new FormData();
  form.append('file', file);
  return apiFetch('/documents/invoices', { method: 'POST', formData: form });
};
export const getInvoices = () => apiFetch('/documents/invoices');
export const updateInvoiceStatus = (invoiceId, status) =>
  apiFetch(`/documents/invoices/${encodeURIComponent(invoiceId)}/status`, { method: 'PATCH', body: { status } });
export const getSubscriptions = () => apiFetch('/subscriptions');
export const cancelSubscription = (subscriptionId) =>
  apiFetch(`/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, { method: 'PATCH' });
export const getOrderStatus = (orderId) => apiFetch(`/orders/${encodeURIComponent(orderId)}`);
export const createPaypalOrder = (orderId) => apiFetch(`/orders/${orderId}/paypal`, { method: 'POST' });
export const capturePayment = (orderId) => apiFetch(`/orders/${orderId}/capture`, { method: 'POST' });
export const cancelOrder = (orderId) => apiFetch(`/orders/${orderId}/cancel`, { method: 'POST' });

export const getTransactions = ({ page = 1, limit = 10, status, q } = {}) => {
  const params = new URLSearchParams({ page, limit });
  if (status) params.set('status', status);
  if (q) params.set('q', q);
  return apiFetch(`/transactions?${params}`);
};

export const refundTransaction = (transactionId) =>
  apiFetch(`/transactions/${encodeURIComponent(transactionId)}/refund`, { method: 'POST' });
export const getAuditEvents = () => apiFetch('/transactions/audit');
export const getAnalytics = ({ days = 30 } = {}) =>
  apiFetch(`/analytics?${new URLSearchParams({ days })}`);
export const getDepartmentReport = () => apiFetch('/analytics/departments');
export const askTransactionCopilot = (question) =>
  apiFetch('/copilot/transactions', { method: 'POST', body: { question } });
export const getNotifications = () => apiFetch('/notifications');
export const markNotificationRead = (notificationId) =>
  apiFetch(`/notifications/${encodeURIComponent(notificationId)}/read`, { method: 'PATCH' });

export const getDeadOutboxEvents = () => apiFetch('/admin/outbox/dead');
export const retryDeadOutboxEvent = (eventId) =>
  apiFetch(`/admin/outbox/${encodeURIComponent(eventId)}/retry`, { method: 'POST' });

export const getAdminProducts = () => apiFetch('/admin/products');
export const getVendors = () => apiFetch('/admin/vendors');
export const createVendor = (body) => apiFetch('/admin/vendors', { method: 'POST', body });
export const updateVendor = (vendorId, body) =>
  apiFetch(`/admin/vendors/${encodeURIComponent(vendorId)}`, { method: 'PATCH', body });
export const getVendorOffers = () => apiFetch('/admin/offers');
export const createVendorOffer = (body) => apiFetch('/admin/offers', { method: 'POST', body });
export const updateVendorOffer = (offerId, body) =>
  apiFetch(`/admin/offers/${encodeURIComponent(offerId)}`, { method: 'PATCH', body });
export const deactivateVendorOffer = (offerId) =>
  apiFetch(`/admin/offers/${encodeURIComponent(offerId)}`, { method: 'DELETE' });

export const formatMoney = (cents, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format((cents ?? 0) / 100);

const api = {
  get: (path) => apiFetch(path),
  post: (path, body) => apiFetch(path, { method: 'POST', body }),
  put: (path, body) => apiFetch(path, { method: 'PUT', body }),
  patch: (path, body) => apiFetch(path, { method: 'PATCH', body }),
  del: (path) => apiFetch(path, { method: 'DELETE' }),
};

export default api;