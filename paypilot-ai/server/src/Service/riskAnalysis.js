const HIGH_VALUE_CENTS = { USD: 100_000, INR: 10_000_000 };
const PURCHASE_BURST_LIMIT = 4;
const PURCHASE_BURST_WINDOW_MS = 10 * 60 * 1000;

function isRecent(createdAt, now) {
  const timestamp = new Date(createdAt).getTime();
  return Number.isFinite(timestamp)
    && timestamp <= now
    && now - timestamp <= PURCHASE_BURST_WINDOW_MS;
}

export function assessTransactionRisk(transaction, recentTransactions, now = Date.now()) {
  const signals = [];
  const threshold = HIGH_VALUE_CENTS[transaction.currency];

  if (threshold && transaction.amountCents >= threshold) {
    signals.push({
      code: 'high_value',
      severity: 'medium',
      explanation: `Single transaction is at least ${new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: transaction.currency,
        maximumFractionDigits: 0,
      }).format(threshold / 100)} ${transaction.currency}.`,
    });
  }

  const sameCurrencyAmounts = recentTransactions
    .filter((item) => item.currency === transaction.currency && Number.isSafeInteger(item.amountCents) && item.amountCents > 0)
    .map((item) => item.amountCents);
  if (sameCurrencyAmounts.length >= 3) {
    const averageCents = sameCurrencyAmounts.reduce((sum, amount) => sum + amount, 0) / sameCurrencyAmounts.length;
    if (transaction.amountCents >= averageCents * 3) {
      signals.push({
        code: 'unusual_amount',
        severity: 'medium',
        explanation: `This purchase is at least 3 times the average of ${sameCurrencyAmounts.length} recent purchases in ${transaction.currency}.`,
      });
    }
  }

  const burstCount = recentTransactions.filter((item) => {
    if (item.currency !== transaction.currency) return false;
    return isRecent(item.createdAt, now);
  }).length + 1;

  if (burstCount >= PURCHASE_BURST_LIMIT) {
    signals.push({
      code: 'purchase_burst',
      severity: 'high',
      explanation: `${burstCount} purchases in the same currency within 10 minutes.`,
    });
  }

  return signals;
}

export function assessPurchaseAttemptRisk(recentOrders, now = Date.now()) {
  const attemptCount = recentOrders.filter((order) =>
    ['pending_approval', 'payment_created', 'capturing', 'paid', 'failed', 'cancelled'].includes(order.status)
      && isRecent(order.createdAt, now),
  ).length + 1;
  if (attemptCount < PURCHASE_BURST_LIMIT) return [];
  return [{
    code: 'repeated_attempts',
    severity: 'high',
    explanation: `${attemptCount} purchase attempts were started within 10 minutes. Review this activity with the account holder.`,
  }];
}

export function assessCaptureAttemptRisk(attemptCount) {
  if (!Number.isInteger(attemptCount) || attemptCount < PURCHASE_BURST_LIMIT) return [];
  return [{
    code: 'repeated_payment_attempts',
    severity: 'high',
    explanation: `${attemptCount} payment attempts were made for one order. Review this activity with the account holder.`,
  }];
}
