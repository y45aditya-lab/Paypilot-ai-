import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assessCaptureAttemptRisk,
  assessPurchaseAttemptRisk,
  assessTransactionRisk,
} from '../src/Service/riskAnalysis.js';

test('flags a high-value USD purchase with an explicit explanation', () => {
  const signals = assessTransactionRisk(
    { currency: 'USD', amountCents: 100_000 },
    [],
    Date.parse('2026-01-01T12:00:00Z'),
  );

  assert.deepEqual(signals.map(({ code, severity }) => ({ code, severity })), [
    { code: 'high_value', severity: 'medium' },
  ]);
  assert.match(signals[0].explanation, /1,000 USD/);
});

test('flags a fourth same-currency transaction in a ten-minute window', () => {
  const now = Date.parse('2026-01-01T12:00:00Z');
  const recent = [1, 2, 3].map((minutes) => ({
    currency: 'USD',
    createdAt: new Date(now - minutes * 60_000),
  }));
  const signals = assessTransactionRisk({ currency: 'USD', amountCents: 1000 }, recent, now);

  assert.deepEqual(signals.map((signal) => signal.code), ['purchase_burst']);
  assert.match(signals[0].explanation, /4 purchases/);
});

test('does not combine different currencies or stale purchases in burst signals', () => {
  const now = Date.parse('2026-01-01T12:00:00Z');
  const recent = [
    { currency: 'EUR', createdAt: new Date(now - 1000) },
    { currency: 'USD', createdAt: new Date(now - 11 * 60_000) },
    { currency: 'USD', createdAt: new Date(now + 60_000) },
  ];

  assert.deepEqual(assessTransactionRisk({ currency: 'USD', amountCents: 999 }, recent, now), []);
});

test('reports burst review signals without calling them fraud', () => {
  const now = Date.now();
  const recent = Array.from({ length: 3 }, () => ({ currency: 'EUR', createdAt: new Date(now - 1000) }));
  const [signal] = assessTransactionRisk({ currency: 'EUR', amountCents: 500 }, recent, now);

  assert.equal(signal.severity, 'high');
  assert.match(signal.explanation, /purchases in the same currency/);
});

test('flags high-value INR transactions at the configured rupee threshold', () => {
  const [signal] = assessTransactionRisk({ currency: 'INR', amountCents: 10_000_000 }, []);
  assert.equal(signal.code, 'high_value');
  assert.match(signal.explanation, /₹1,00,000/);
});

test('flags an amount at least three times the recent same-currency average', () => {
  const previous = [1000, 1200, 800].map((amountCents) => ({ amountCents, currency: 'INR' }));
  const [signal] = assessTransactionRisk({ currency: 'INR', amountCents: 3000 }, previous);
  assert.equal(signal.code, 'unusual_amount');
  assert.match(signal.explanation, /3 times the average of 3 recent purchases/);
  assert.deepEqual(assessTransactionRisk(
    { currency: 'INR', amountCents: 3000 },
    previous.map((item) => ({ ...item, currency: 'USD' })),
  ), []);
});

test('flags repeated order attempts but ignores stale or future attempts', () => {
  const now = Date.parse('2026-01-01T12:00:00Z');
  const recent = ['paid', 'failed', 'cancelled'].map((status, index) => ({
    status,
    createdAt: new Date(now - (index + 1) * 60_000),
  }));
  const [signal] = assessPurchaseAttemptRisk(recent, now);
  assert.equal(signal.code, 'repeated_attempts');
  assert.match(signal.explanation, /4 purchase attempts/);
  assert.deepEqual(assessPurchaseAttemptRisk([
    { status: 'paid', createdAt: new Date(now - 11 * 60_000) },
    { status: 'paid', createdAt: new Date(now + 60_000) },
  ], now), []);
});

test('flags repeated capture retries on the same order at the threshold', () => {
  assert.deepEqual(assessCaptureAttemptRisk(3), []);
  assert.equal(assessCaptureAttemptRisk(4)[0].code, 'repeated_payment_attempts');
});
