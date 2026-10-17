export const DEFAULT_FINANCE_THRESHOLD_CENTS = 1_000_000;

export function approvalStage(status) {
  if (status === 'awaiting_manager') return 'manager';
  if (status === 'awaiting_finance') return 'finance';
  return null;
}

export function canApprovePurchase(role, stage) {
  return role === 'admin'
    || (stage === 'manager' && role === 'manager')
    || (stage === 'finance' && role === 'finance');
}

export function nextApprovalStatus({ status, decision, amountCents, financeThresholdCents = DEFAULT_FINANCE_THRESHOLD_CENTS }) {
  if (!['awaiting_manager', 'awaiting_finance'].includes(status)) {
    throw new Error('Purchase request is not awaiting an approval.');
  }
  if (decision === 'reject') return 'rejected';
  if (decision === 'changes_requested') return 'changes_requested';
  if (decision !== 'approve') throw new Error('Unsupported approval decision.');
  if (status === 'awaiting_manager' && amountCents > financeThresholdCents) return 'awaiting_finance';
  return 'approved';
}
