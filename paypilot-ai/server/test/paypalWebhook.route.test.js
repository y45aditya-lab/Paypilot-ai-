import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { createPayPalWebhookRouter } from '../src/Service/paypalWebhook.js';

async function withServer(router, run) {
  const app = express();
  app.use('/webhooks/paypal', express.raw({ type: 'application/json' }), router);
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  try {
    await run(`http://127.0.0.1:${address.port}/webhooks/paypal`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function fakeModel({ create = async () => ({}), findOne = async () => null, findOneAndUpdate = async () => ({ matchedCount: 1 }), updateOne = async () => ({ matchedCount: 1 }) } = {}) {
  return { create, findOne, findOneAndUpdate, updateOne };
}

const headers = { 'content-type': 'application/json' };
const payload = (overrides = {}) => JSON.stringify({ id: 'WH-123', event_type: 'PAYMENT.CAPTURE.COMPLETED', ...overrides });

test('rejects invalid signatures before attempting to claim an event', async () => {
  let claims = 0;
  const router = createPayPalWebhookRouter({
    WebhookEventModel: fakeModel({ create: async () => { claims += 1; } }),
    verifySignature: async () => false,
    eventHandler: async () => 'processed',
  });
  await withServer(router, async (url) => {
    const response = await fetch(url, { method: 'POST', headers, body: payload() });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'Invalid signature' });
    assert.equal(claims, 0);
  });
});

test('rejects malformed JSON and events without an id', async () => {
  const router = createPayPalWebhookRouter({
    WebhookEventModel: fakeModel(),
    verifySignature: async () => true,
    eventHandler: async () => 'processed',
  });
  await withServer(router, async (url) => {
    const malformed = await fetch(url, { method: 'POST', headers, body: '{bad json' });
    assert.equal(malformed.status, 400);
    assert.deepEqual(await malformed.json(), { error: 'Invalid JSON' });

    const missingId = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ event_type: 'PAYMENT.CAPTURE.COMPLETED' }) });
    assert.equal(missingId.status, 400);
    assert.deepEqual(await missingId.json(), { error: 'Missing event id' });
  });
});

test('acknowledges already processed duplicate event ids without running the handler again', async () => {
  let handled = 0;
  const duplicateError = Object.assign(new Error('duplicate key'), { code: 11000 });
  const router = createPayPalWebhookRouter({
    WebhookEventModel: fakeModel({
      create: async () => { throw duplicateError; },
      findOne: () => ({ lean: async () => ({ status: 'processed', eventId: 'WH-123' }) }),
    }),
    verifySignature: async () => true,
    eventHandler: async () => { handled += 1; return 'processed'; },
  });
  await withServer(router, async (url) => {
    const response = await fetch(url, { method: 'POST', headers, body: payload() });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { duplicate: true });
    assert.equal(handled, 0);
  });
});

test('marks handler failures for provider retry and finalizes successful events', async () => {
  const records = [];
  const model = fakeModel({
    create: async (record) => { records.push({ ...record }); return record; },
    updateOne: async (filter, update) => {
      records.push({ filter, update });
      return { matchedCount: 1 };
    },
  });
  const failingRouter = createPayPalWebhookRouter({
    WebhookEventModel: model,
    verifySignature: async () => true,
    eventHandler: async () => { throw new Error('temporary downstream failure'); },
  });
  await withServer(failingRouter, async (url) => {
    const response = await fetch(url, { method: 'POST', headers, body: payload() });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'Processing failed' });
    assert.ok(records.some((record) => record.update?.$set?.status === 'failed' || record.update?.status === 'failed'));
  });

  const successRecords = [];
  const successRouter = createPayPalWebhookRouter({
    WebhookEventModel: fakeModel({
      create: async (record) => { successRecords.push(record); return record; },
      updateOne: async (filter, update) => {
        successRecords.push({ filter, update });
        return { matchedCount: 1 };
      },
    }),
    verifySignature: async () => true,
    eventHandler: async () => 'processed',
  });
  await withServer(successRouter, async (url) => {
    const response = await fetch(url, { method: 'POST', headers, body: payload({ id: 'WH-456' }) });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { received: true });
    assert.ok(successRecords.some((record) => record.update?.status === 'processed'));
  });
});

test('returns retryable response when the processing token no longer owns finalization', async () => {
  const router = createPayPalWebhookRouter({
    WebhookEventModel: fakeModel({
      create: async (record) => record,
      updateOne: async () => ({ matchedCount: 0 }),
    }),
    verifySignature: async () => true,
    eventHandler: async () => 'processed',
  });
  await withServer(router, async (url) => {
    const response = await fetch(url, { method: 'POST', headers, body: payload({ id: 'WH-STALE' }) });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'Processing claim expired; provider may retry' });
  });
});

test('returns retryable server error when signature verification is unavailable', async () => {
  const router = createPayPalWebhookRouter({
    WebhookEventModel: fakeModel(),
    verifySignature: async () => { throw new Error('provider verification unavailable'); },
    eventHandler: async () => assert.fail('handler must not run when verification fails'),
  });
  await withServer(router, async (url) => {
    const response = await fetch(url, { method: 'POST', headers, body: payload({ id: 'WH-VERIFY-ERROR' }) });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'Verification unavailable' });
  });
});
