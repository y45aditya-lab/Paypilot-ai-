
import axios from "axios";

const api = axios.create({
  baseURL:
    import.meta.env.VITE_API_URL ||
    "http://localhost:5000/api",
  headers: {
    "Content-Type": "application/json",
  },
});
const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export async function requestRecommendation({ message, budgetUsd }) {
  const res = await fetch(`${API}/recommendations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, budgetUsd }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error); // 400s and server errors
  return data; // { ok, quote, reasoning } or { ok:false, reason }
}

export const formatMoney = (cents, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);

// Check backend health
export async function checkBackendHealth() {
  const response = await api.get("/health");
  return response.data;
}

// Get products
export async function getProducts() {
  const response = await api.get("/products");
  return response.data;
}

// Create product
export async function createProduct(product) {
  const response = await api.post("/products", product);
  return response.data;
}

// Get payment transactions
export async function getTransactions() {
  const response = await api.get("/payments/transactions");
  return response.data;
}

// Create PayPal order
export async function createPaymentOrder(productId) {
  const response = await api.post("/payments/orders", {
    productId,
  });
  return response.data;
}

// Capture approved PayPal order
export async function capturePaymentOrder(orderId) {
  const response = await api.post("/payments/capture", {
    orderId,
  });
  return response.data;
}

export default api;