import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPrintableTransactionReport, buildTransactionCsv } from '../src/services/transactionReport.js';

const records = [
  {
    productName: '=HYPERLINK("https://bad.example")',
    amountCents: 12500,
    currency: 'INR',
    status: 'completed',
    refundStatus: 'not_requested',
    createdAt: '2026-01-01T12:00:00.000Z',
    paypalCaptureId: 'capture-1',
  },
  {
    productName: '<script>alert(1)</script>',
    amountCents: 12500,
    currency: 'INR',
    status: 'refunded',
    refundStatus: 'completed',
    createdAt: '2026-01-02T12:00:00.000Z',
    paypalCaptureId: 'capture-2',
  },
];

test('CSV includes the complete matching report and escapes formula cells', () => {
  const csv = buildTransactionCsv(records);
  assert.match(csv, /Matching transactions/);
  assert.match(csv, /Completed gross/);
  assert.match(csv, /Refunded/);
  assert.match(csv, /"'=HYPERLINK/);
  assert.match(csv, /capture-2/);
});

test('print report keeps currencies separate and escapes untrusted text', () => {
  const html = buildPrintableTransactionReport(records);
  assert.match(html, /INR/);
  assert.match(html, /window\.print\(\)/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
});
