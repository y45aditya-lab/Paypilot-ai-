import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInvoiceFields } from '../src/routes/documents.js';

test('invoice field parser extracts values without claiming certainty', () => {
  const fields = parseInvoiceFields('ACME Cloud\nInvoice No: INV-2048\nTotal Due: INR 1,299.50\nDue Date: 2026-12-01');
  assert.equal(fields.vendor, 'ACME Cloud');
  assert.equal(fields.invoiceNumber, 'INV-2048');
  assert.equal(fields.amountCents, 129950);
  assert.equal(fields.dueDate.toISOString().slice(0, 10), '2026-12-01');
});

test('invoice field parser leaves missing amounts for human review', () => {
  assert.equal(parseInvoiceFields('Acme Cloud Invoice\nAnnual software plan').amountCents, undefined);
});
