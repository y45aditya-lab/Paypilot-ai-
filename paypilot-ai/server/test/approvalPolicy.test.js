import test from 'node:test';
import assert from 'node:assert/strict';
import { canApprovePurchase, nextApprovalStatus } from '../src/Service/approvalPolicy.js';

test('every purchase requires manager approval before finance routing', () => {
  assert.equal(nextApprovalStatus({
    status: 'awaiting_manager', decision: 'approve', amountCents: 1_000_000,
  }), 'approved');
  assert.equal(nextApprovalStatus({
    status: 'awaiting_manager', decision: 'approve', amountCents: 1_000_001,
  }), 'awaiting_finance');
});

test('only the configured reviewer roles can act at each approval stage', () => {
  assert.equal(canApprovePurchase('manager', 'manager'), true);
  assert.equal(canApprovePurchase('finance', 'manager'), false);
  assert.equal(canApprovePurchase('manager', 'finance'), false);
  assert.equal(canApprovePurchase('finance', 'finance'), true);
  assert.equal(canApprovePurchase('employee', 'manager'), false);
});

test('requests can be rejected or returned for changes', () => {
  assert.equal(nextApprovalStatus({
    status: 'awaiting_manager', decision: 'reject', amountCents: 50_000,
  }), 'rejected');
  assert.equal(nextApprovalStatus({
    status: 'awaiting_finance', decision: 'changes_requested', amountCents: 2_000_000,
  }), 'changes_requested');
});
