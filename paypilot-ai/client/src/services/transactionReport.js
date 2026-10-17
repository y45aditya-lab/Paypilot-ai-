function csvCell(value) {
  const safeValue = String(value ?? '').replace(/^[\s]*[=+@-]/, "'$&");
  return `"${safeValue.replaceAll('"', '""')}"`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function currencyTotals(transactions) {
  return transactions.reduce((totals, transaction) => {
    const entry = totals[transaction.currency] ??= { completed: 0, refunded: 0, pending: 0, failed: 0 };
    if (Object.hasOwn(entry, transaction.status)) entry[transaction.status] += transaction.amountCents;
    return totals;
  }, {});
}

export function buildTransactionCsv(transactions) {
  const totals = currencyTotals(transactions);
  const rows = [
    ['PayPilot transaction and spending report'],
    ['Generated at', new Date().toISOString()],
    ['Matching transactions', transactions.length],
    [],
    ['Currency', 'Completed gross', 'Refunded', 'Pending', 'Failed'],
    ...Object.entries(totals).map(([currency, values]) => [
      currency,
      (values.completed / 100).toFixed(2),
      (values.refunded / 100).toFixed(2),
      (values.pending / 100).toFixed(2),
      (values.failed / 100).toFixed(2),
    ]),
    [],
    ['Product', 'Amount', 'Currency', 'Status', 'Refund status', 'Date', 'PayPal capture ID'],
    ...transactions.map((item) => [
      item.productName,
      (item.amountCents / 100).toFixed(2),
      item.currency,
      item.status,
      item.refundStatus,
      new Date(item.createdAt).toISOString(),
      item.paypalCaptureId,
    ]),
  ];
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
}

export function buildPrintableTransactionReport(transactions) {
  const totals = currencyTotals(transactions);
  const money = (cents, currency) => new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
  }).format(cents / 100);
  const summary = Object.entries(totals).map(([currency, values]) => `
    <tr><td>${escapeHtml(currency)}</td><td>${money(values.completed, currency)}</td>
    <td>${money(values.refunded, currency)}</td><td>${money(values.pending, currency)}</td>
    <td>${money(values.failed, currency)}</td></tr>`).join('');
  const detailRows = transactions.map((item) => `
    <tr><td>${escapeHtml(item.productName)}</td><td>${money(item.amountCents, item.currency)}</td>
    <td>${escapeHtml(item.status)}</td><td>${escapeHtml(item.refundStatus)}</td>
    <td>${escapeHtml(new Date(item.createdAt).toLocaleString())}</td></tr>`).join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>PayPilot transaction report</title><style>
body{font:14px Arial,sans-serif;color:#18212f;margin:32px}h1{margin-bottom:4px}
.muted{color:#526174;font-size:12px;margin:0 0 24px}h2{font-size:16px;margin:24px 0 8px}
table{width:100%;border-collapse:collapse;margin-bottom:20px}th,td{text-align:left;padding:8px;border-bottom:1px solid #d9e0e8}
th{background:#f0f4f7;font-size:11px;text-transform:uppercase}td{font-size:12px;overflow-wrap:anywhere}
@media print{body{margin:12mm}tr{break-inside:avoid}h2{break-after:avoid}}
</style></head><body><h1>PayPilot transaction report</h1>
<p class="muted">Generated ${escapeHtml(new Date().toLocaleString())} · ${transactions.length} matching transaction(s). Currency totals are reported separately.</p>
<h2>Spending summary</h2><table><thead><tr><th>Currency</th><th>Completed gross</th><th>Refunded</th><th>Pending</th><th>Failed</th></tr></thead><tbody>
${summary || '<tr><td colspan="5">No matching transactions.</td></tr>'}</tbody></table>
<h2>Transactions</h2><table><thead><tr><th>Product</th><th>Amount</th><th>Status</th><th>Refund status</th><th>Date</th></tr></thead><tbody>
${detailRows || '<tr><td colspan="5">No matching transactions.</td></tr>'}</tbody></table>
<p class="muted">Payment records are account-scoped. Amounts reflect recorded transaction values and are not financial advice.</p>
<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),250));</script></body></html>`;
}
