import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import mongoose from 'mongoose';
import { createTransactionRouter } from '../src/routes/Transcation.js';

const userId = new mongoose.Types.ObjectId().toString();
const organizationId = new mongoose.Types.ObjectId().toString();
const transactionId = new mongoose.Types.ObjectId().toString();

function makeTransaction(overrides = {}) {
  return {
    _id: transactionId,
    user: userId,
    organization: organizationId,
    order: new mongoose.Types.ObjectId().toString(),
    paypalCaptureId: 'CAPTURE-123',
    productName: 'Demo product',
    amountCents: 1234,
    currency: 'USD',
    status: 'completed',
    refundStatus: 'processing',
    refundId: undefined,
    ...overrides,
  };
}

async function withRoute({ initial, refundResult, refundError, settled, failureState, existing, exactRefund, classifyFailure }, run) {
  let updateCalls = 0;
  let providerCalls = 0;
  let audits = [];
  let notifications = [];
  const transaction = makeTransaction();
  const TransactionModel = {
    findOneAndUpdate: async (_filter, update) => {
      updateCalls += 1;
      if (updateCalls === 1) return initial === 'missing' ? null : initial || transaction;
      if (update?.$set?.refundStatus === 'pending' || update?.$set?.refundStatus === 'failed') {
        return failureState || { ...transaction, refundStatus: update.$set.refundStatus };
      }
      return settled || { ...transaction, ...update?.$set };
    },
    findOne: async () => existing || transaction,
    findById: async () => existing || transaction,
  };
  const router = createTransactionRouter({
    TransactionModel,
    refundCapture: async () => {
      providerCalls += 1;
      if (refundError) throw refundError;
      return refundResult;
    },
    PayPalErrorClass: class PayPalErrorTest extends Error {},
    classifyRefundFailure: classifyFailure || (() => false),
    exactRefund: exactRefund || ((refund, cents, currency) =>
      refund?.amount?.value === (cents / 100).toFixed(2) && refund?.amount?.currency_code === currency),
    auditEvent: async (...args) => { audits.push(args); },
    notify: async (...args) => { notifications.push(args); },
    OrderModel: { findOne: () => ({ select: async () => null }) },
    PurchaseOrderModel: { findOne: async () => null, updateOne: async () => ({}) },
    SubscriptionModel: { updateOne: async () => ({}) },
  });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: userId, organizationId }; next(); });
  app.use('/api/transactions', router);
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/transactions/${transactionId}/refund`;
  try {
    await run({ base, get providerCalls() { return providerCalls; }, get updateCalls() { return updateCalls; }, audits, notifications });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('records an exact completed full refund as refunded', async () => {
  const transaction = makeTransaction();
  await withRoute({
    initial: transaction,
    refundResult: { id: 'REFUND-123', status: 'COMPLETED', amount: { value: '12.34', currency_code: 'USD' } },
    settled: { ...transaction, status: 'refunded', refundStatus: 'completed', refundId: 'REFUND-123' },
  }, async ({ base, providerCalls, notifications }) => {
    const response = await fetch(base, { method: 'POST' });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.transaction.status, 'refunded');
    assert.equal(body.transaction.refundStatus, 'completed');
    assert.equal(body.transaction.refundId, 'REFUND-123');
    assert.equal(providerCalls, 1);
    assert.equal(notifications.length, 1);
  });
});

test('does not mark a partial or wrong-currency provider refund as completed', async () => {
  const transaction = makeTransaction();
  await withRoute({
    initial: transaction,
    refundResult: { id: 'REFUND-PARTIAL', status: 'COMPLETED', amount: { value: '1.00', currency_code: 'USD' } },
    exactRefund: () => false,
    settled: { ...transaction, refundStatus: 'review_required', refundId: 'REFUND-PARTIAL' },
  }, async ({ base, notifications }) => {
    const response = await fetch(base, { method: 'POST' });
    assert.equal(response.status, 202);
    const body = await response.json();
    assert.equal(body.reviewRequired, true);
    assert.equal(body.transaction.status, 'completed');
    assert.equal(body.transaction.refundStatus, 'review_required');
    assert.equal(notifications.length, 1);
  });
});

test('keeps an ambiguous timeout pending and tells the client not to submit again', async () => {
  const transaction = makeTransaction();
  await withRoute({
    initial: transaction,
    refundError: new Error('socket timeout after request'),
    failureState: { ...transaction, refundStatus: 'pending' },
  }, async ({ base, providerCalls }) => {
    const response = await fetch(base, { method: 'POST' });
    assert.equal(response.status, 202);
    const body = await response.json();
    assert.equal(body.pending, true);
    assert.match(body.message, /Do not submit another refund request/);
    assert.equal(body.transaction.refundStatus, 'pending');
    assert.equal(providerCalls, 1);
  });
});

test('does not issue a second provider request while refund is already processing', async () => {
  const transaction = makeTransaction({ refundStatus: 'processing' });
  await withRoute({
    initial: 'missing',
    existing: transaction,
  }, async ({ base, providerCalls }) => {
    const response = await fetch(base, { method: 'POST' });
    assert.equal(response.status, 202);
    assert.equal((await response.json()).pending, true);
    assert.equal(providerCalls, 0);
  });
});

test('returns the settled state when the transaction is already refunded', async () => {
  const transaction = makeTransaction({ status: 'refunded', refundStatus: 'completed', refundId: 'REFUND-DONE' });
  await withRoute({
    initial: 'missing',
    existing: transaction,
  }, async ({ base, providerCalls }) => {
    const response = await fetch(base, { method: 'POST' });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).alreadyRefunded, true);
    assert.equal(providerCalls, 0);
  });
});

test('scopes refund lookup to the authenticated user and organization', async () => {
  const observedFilters = [];
  let providerCalls = 0;
  const TransactionModel = {
    findOneAndUpdate: async (filter) => { observedFilters.push(filter); return null; },
    findOne: async (filter) => { observedFilters.push(filter); return null; },
    findById: async () => null,
  };
  const router = createTransactionRouter({
    TransactionModel,
    refundCapture: async () => { providerCalls += 1; return { id: 'SHOULD-NOT-RUN', status: 'COMPLETED' }; },
    auditEvent: async () => {},
    notify: async () => {},
  });
  const app = express();
  app.use((req, _res, next) => { req.user = { id: userId, organizationId }; next(); });
  app.use('/api/transactions', router);
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/transactions/${transactionId}/refund`, { method: 'POST' });
    assert.equal(response.status, 404);
    assert.equal(providerCalls, 0);
    assert.equal(observedFilters.length, 2);
    for (const filter of observedFilters) {
      assert.equal(String(filter.user), userId);
      assert.equal(String(filter.organization), organizationId);
    }
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
