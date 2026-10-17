import test from 'node:test';
import assert from 'node:assert/strict';
import { answerFromRecords, answerTransactionQuestionWithAI } from '../src/Service/transactionCopilot.js';

test('answers spend questions with verified totals and keeps currencies separate', () => {
  const answer = answerFromRecords(
    'How much did I spend in the last 90 days?',
    [
      { currency: 'USD', status: 'completed', count: 2, amountCents: 12000 },
      { currency: 'USD', status: 'refunded', count: 1, amountCents: 3000 },
      { currency: 'EUR', status: 'completed', count: 1, amountCents: 2000 },
    ],
    [],
    [],
  );

  assert.match(answer, /\$120\.00 net/);
  assert.match(answer, /€20\.00 net/);
  assert.match(answer, /USD:/);
  assert.match(answer, /EUR:/);
});

test('answers refund questions from refunded records', () => {
  const answer = answerFromRecords(
    'Which products had refunds?',
    [],
    [],
    [],
    [{ productName: 'CRM Plus', currency: 'USD', count: 1, amountCents: 4500 }],
  );

  assert.match(answer, /CRM Plus: \$45\.00 across 1 refunded transaction/);
});

test('answers review-signal questions with recorded reasons and avoids fraud claims', () => {
  const answer = answerFromRecords(
    'Do my recent purchases show any review signals?',
    [],
    [],
    [{ signals: [{ explanation: '4 purchases in the same currency within 10 minutes.' }] }],
  );

  assert.match(answer, /4 purchases in the same currency/);
  assert.doesNotMatch(answer, /fraudulent|fraudster/i);
});

test('describes empty account data without inventing totals', () => {
  const answer = answerFromRecords('How much did I spend?', [], [], []);
  assert.match(answer, /No transactions appear/);
});

test('answers suggested review question without requiring external AI availability', async () => {
  const response = await answerTransactionQuestionWithAI({
    question: 'Do my recent purchases show any review signals?',
    summary: [],
    recentTransactions: [],
    riskAlerts: [],
    refundedProducts: [],
  });

  assert.equal(response.mode, 'verified-records');
  assert.match(response.answer, /No rules-based transaction review signals/);
  assert.match(response.notice, /verified transaction records/);
});
