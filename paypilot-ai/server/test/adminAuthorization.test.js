import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { requireRole } from '../src/middleware/requireRole.js';

async function withApp(role, run) {
  let protectedCalls = 0;
  const app = express();
  app.use((req, _res, next) => {
    req.user = role ? { id: 'test-user', role, organizationId: 'org-test' } : undefined;
    next();
  });
  app.get('/api/admin/outbox/dead', requireRole('admin'), (_req, res) => {
    protectedCalls += 1;
    res.json({ events: [] });
  });
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}/api/admin/outbox/dead`, () => protectedCalls);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('non-admin and missing-user requests cannot reach admin outbox handlers', async () => {
  for (const role of ['employee', 'manager', undefined]) {
    await withApp(role, async (url, getProtectedCalls) => {
      const response = await fetch(url);
      assert.equal(response.status, 403);
      assert.deepEqual(await response.json(), { error: 'Forbidden' });
      assert.equal(getProtectedCalls(), 0);
    });
  }
});

test('admin role can reach the protected admin handler', async () => {
  await withApp('admin', async (url, getProtectedCalls) => {
    const response = await fetch(url);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { events: [] });
    assert.equal(getProtectedCalls(), 1);
  });
});
