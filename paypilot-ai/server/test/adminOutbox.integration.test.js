import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import mongoose from 'mongoose';
import OutboxEvent from '../src/models/OutboxEvent.js';
import { requireRole } from '../src/middleware/requireRole.js';
import adminRouter from '../src/routes/admin.js';

const baseUri = process.env.TEST_MONGODB_URI;
const uri = baseUri ? (() => {
  const parsed = new URL(baseUri);
  parsed.pathname = `/paypilot_admin_outbox_it_${process.pid}`;
  return parsed.toString();
})() : null;

test('admin outbox recovery API enforces role and organization scope', { skip: !uri }, async (t) => {
  await mongoose.connect(uri);
  await Promise.all([OutboxEvent.init()]);
  const organizationA = new mongoose.Types.ObjectId().toString();
  const organizationB = new mongoose.Types.ObjectId().toString();
  const prefix = `admin-outbox-it-${process.pid}-${Date.now()}`;

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = {
      id: new mongoose.Types.ObjectId().toString(),
      organizationId: req.header('x-test-organization'),
      role: req.header('x-test-role') || 'employee',
    };
    next();
  });
  app.use('/api/admin', requireRole('admin'), adminRouter);

  const server = app.listen(0);
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}/api/admin`;

  try {
    await OutboxEvent.create([
      {
        eventKey: `${prefix}-org-a`,
        eventType: 'payment_notification',
        status: 'dead',
        attempts: 12,
        payload: { organizationId: organizationA, orderId: new mongoose.Types.ObjectId().toString(), secret: 'must-not-leak' },
      },
      {
        eventKey: `${prefix}-org-b`,
        eventType: 'payment_notification',
        status: 'dead',
        attempts: 12,
        payload: { organizationId: organizationB, orderId: new mongoose.Types.ObjectId().toString() },
      },
    ]);

    await t.test('non-admin cannot list dead-letter events', async () => {
      const response = await fetch(`${base}/outbox/dead`, {
        headers: { 'x-test-organization': organizationA, 'x-test-role': 'employee' },
      });
      assert.equal(response.status, 403);
    });

    await t.test('admin sees only own organization metadata and no payload', async () => {
      const response = await fetch(`${base}/outbox/dead`, {
        headers: { 'x-test-organization': organizationA, 'x-test-role': 'admin' },
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.events.length, 1);
      assert.equal(body.events[0].eventType, 'payment_notification');
      assert.equal(JSON.stringify(body).includes('must-not-leak'), false);
      assert.equal(JSON.stringify(body).includes(organizationB), false);
    });

    await t.test('admin retry is organization-scoped and capped', async () => {
      const own = await OutboxEvent.findOne({ eventKey: `${prefix}-org-a` }).lean();
      const other = await OutboxEvent.findOne({ eventKey: `${prefix}-org-b` }).lean();

      const crossOrg = await fetch(`${base}/outbox/${other._id}/retry`, {
        method: 'POST',
        headers: { 'x-test-organization': organizationA, 'x-test-role': 'admin' },
      });
      assert.equal(crossOrg.status, 404);

      for (let attempt = 0; attempt < 3; attempt += 1) {
        await OutboxEvent.updateOne(
          { _id: own._id },
          { $set: { status: 'dead', attempts: 12, availableAt: new Date(), manualRetries: attempt } },
        );
        const response = await fetch(`${base}/outbox/${own._id}/retry`, {
          method: 'POST',
          headers: { 'x-test-organization': organizationA, 'x-test-role': 'admin' },
        });
        assert.equal(response.status, 200);
      }

      await OutboxEvent.updateOne({ _id: own._id }, { $set: { status: 'dead', attempts: 12, manualRetries: 3 } });
      const limited = await fetch(`${base}/outbox/${own._id}/retry`, {
        method: 'POST',
        headers: { 'x-test-organization': organizationA, 'x-test-role': 'admin' },
      });
      assert.equal(limited.status, 409);
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await OutboxEvent.deleteMany({ eventKey: { $regex: `^${prefix}` } });
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
