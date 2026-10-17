import { useEffect, useMemo, useState } from 'react';
import { formatMoney, getAuditEvents, getTransactions, refundTransaction } from '../services/api.js';
import { buildPrintableTransactionReport, buildTransactionCsv } from '../services/transactionReport.js';

const STATUS_STYLES = {
  completed: 'border-emerald-300/15 bg-emerald-300/10 text-emerald-200',
  pending: 'border-amber-300/15 bg-amber-300/10 text-amber-200',
  failed: 'border-red-300/15 bg-red-300/10 text-red-200',
  refunded: 'border-white/10 bg-white/6 text-slate-300',
};

function downloadCsv(content) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `paypilot-transaction-report-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function TransactionHistory() {
  const [data, setData] = useState(null);
  const [auditItems, setAuditItems] = useState([]);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refundLoadingId, setRefundLoadingId] = useState('');
  const [refundMessage, setRefundMessage] = useState('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    let ignore = false;
    getTransactions({ page, status, q: debounced })
      .then((response) => {
        if (!ignore) {
          setData(response);
          setError('');
        }
      })
      .catch((err) => {
        if (!ignore) setError(err.message || 'Could not load payment history.');
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => { ignore = true; };
  }, [page, status, debounced, refreshKey]);

  useEffect(() => {
    let ignore = false;
    getAuditEvents()
      .then((response) => { if (!ignore) setAuditItems(response.items ?? []); })
      .catch((err) => { if (!ignore) setError(err.message || 'Could not load the audit trail.'); });
    return () => { ignore = true; };
  }, [refreshKey]);

  async function requestRefund(transaction) {
    const confirmed = window.confirm(
      `Request a full refund of ${formatMoney(transaction.amountCents, transaction.currency)} for ${transaction.productName}? PayPal will process this in sandbox.`,
    );
    if (!confirmed) return;
    setRefundLoadingId(transaction._id);
    setRefundMessage('');
    setError('');
    try {
      const response = await refundTransaction(transaction._id);
      setRefundMessage(response.reviewRequired
        ? 'PayPal returned a refund state that needs manual review. Check PayPal before retrying.'
        : response.pending
          ? 'Refund request submitted and pending PayPal confirmation.'
          : 'Refund processed successfully.');
      setLoading(true);
      setRefreshKey((value) => value + 1);
    } catch (err) {
      setError(err.message || 'Could not request the refund.');
    } finally {
      setRefundLoadingId('');
    }

  }

  async function loadAllMatchingTransactions() {
    const firstPage = await getTransactions({ page: 1, limit: 50, status, q: debounced });
    const transactions = [...firstPage.items];
    for (let currentPage = 2; currentPage <= firstPage.totalPages; currentPage += 1) {
      const result = await getTransactions({ page: currentPage, limit: 50, status, q: debounced });
      if (!Array.isArray(result.items)) throw new Error('The transaction report response was invalid.');
      transactions.push(...result.items);
    }
    return transactions;
  }

  async function exportCsvReport() {
    setExporting(true);
    setError('');
    try {
      downloadCsv(buildTransactionCsv(await loadAllMatchingTransactions()));
    } catch (err) {
      setError(err.message || 'Could not export the transaction report.');
    } finally {
      setExporting(false);
    }
  }

  async function printPdfReport() {
    const reportWindow = window.open('', '_blank');
    if (!reportWindow) {
      setError('Allow pop-ups to print or save the transaction report as a PDF.');
      return;
    }
    reportWindow.document.write('<p style="font:16px Arial,sans-serif;padding:24px">Preparing your account report…</p>');
    reportWindow.document.close();
    setExporting(true);
    setError('');
    try {
      const transactions = await loadAllMatchingTransactions();
      reportWindow.document.open();
      reportWindow.document.write(buildPrintableTransactionReport(transactions));
      reportWindow.document.close();
    } catch (err) {
      reportWindow.close();
      setError(err.message || 'Could not prepare the printable report.');
    } finally {
      setExporting(false);
    }
  }

  const completedOnPage = useMemo(
    () => (data?.items ?? []).filter((item) => item.status === 'completed'),
    [data],
  );
  const completedTotalsByCurrency = useMemo(() => completedOnPage.reduce((totals, item) => {
    totals[item.currency] = (totals[item.currency] ?? 0) + item.amountCents;
    return totals;
  }, {}), [completedOnPage]);

  const inputClass = 'rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-emerald-300/60 focus:ring-2 focus:ring-emerald-300/10';

  return (
    <section className="space-y-5 rounded-2xl border border-white/10 bg-slate-900/80 p-5 text-slate-100 shadow-xl shadow-black/10 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">Account activity</p>
          <h2 className="mt-1 text-2xl font-bold text-white">Payment history</h2>
          <p className="mt-1 text-sm text-slate-400">Your account-scoped transactions, searchable history, and full spending reports.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" disabled={loading} onClick={() => { setLoading(true); setRefreshKey((value) => value + 1); }} className="rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-300 hover:border-emerald-300/30 hover:text-white disabled:opacity-40">
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <button type="button" disabled={exporting || loading} onClick={exportCsvReport} className="rounded-xl bg-emerald-300 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-40">
            {exporting ? 'Preparing report…' : 'Export full CSV'}
          </button>
          <button type="button" disabled={exporting || loading} onClick={printPdfReport} className="rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-300 hover:border-emerald-300/30 hover:text-white disabled:opacity-40">
            Print / Save PDF
          </button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-white/5 bg-black/20 p-4">
          <p className="text-xs text-slate-500">Matching transactions</p>
          <p className="mt-1 text-xl font-bold text-white">{data?.total ?? '—'}</p>
          <p className="text-[11px] text-slate-500">After the active search and status filters</p>
        </div>
        <div className="rounded-xl border border-white/5 bg-black/20 p-4">
          <p className="text-xs text-slate-500">Completed · this page</p>
          <p className="mt-1 text-xl font-bold text-white">{data ? completedOnPage.length : '—'}</p>
          <p className="text-[11px] text-slate-500">Current page only, not an account-wide total</p>
        </div>
        <div className="rounded-xl border border-white/5 bg-black/20 p-4">
          <p className="text-xs text-slate-500">Completed value · this page</p>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm font-bold text-emerald-200">
            {data && Object.keys(completedTotalsByCurrency).length > 0
              ? Object.entries(completedTotalsByCurrency).map(([currency, cents]) => <span key={currency}>{formatMoney(cents, currency)}</span>)
              : <span>{data ? formatMoney(0) : '—'}</span>}
          </div>
          <p className="text-[11px] text-slate-500">Currencies are kept separate</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <label className="min-w-[220px] grow">
          <span className="sr-only">Search by product name</span>
          <input maxLength={50} className={`${inputClass} w-full`} placeholder="Search products…" value={search} onChange={(event) => { setLoading(true); setSearch(event.target.value); }} />
        </label>
        <label>
          <span className="sr-only">Filter by transaction status</span>
          <select className={inputClass} value={status} onChange={(event) => { setLoading(true); setStatus(event.target.value); setPage(1); }}>
            <option value="">All statuses</option>
            <option value="completed">Completed</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
            <option value="refunded">Refunded</option>
          </select>
        </label>
      </div>

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-300/15 bg-red-300/6 p-3 text-sm text-red-200">
          <p>{error}</p>
          <button type="button" onClick={() => { setLoading(true); setRefreshKey((value) => value + 1); }} className="font-semibold underline underline-offset-4">Try again</button>
        </div>
      )}
      {refundMessage && <p role="status" className="rounded-xl border border-emerald-300/15 bg-emerald-300/6 p-3 text-sm text-emerald-100">{refundMessage}</p>}

      <div className={loading ? 'min-h-20 opacity-60' : ''} aria-live="polite">
        {loading && !data && <p className="py-8 text-center text-sm text-slate-400">Loading account activity…</p>}
        {!loading && data?.items.length === 0 && (
          <div className="rounded-xl border border-dashed border-white/10 py-9 text-center">
            <p className="font-semibold text-white">No transactions found</p>
            <p className="mt-1 text-sm text-slate-500">Try another search or status filter. Completed purchases will appear here.</p>
          </div>
        )}
        {data?.items.length > 0 && (
          <ul className="divide-y divide-white/6">
            {data.items.map((transaction) => (
              <li key={transaction._id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div className="min-w-0">
                  <p className="font-semibold text-white">{transaction.productName}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {new Date(transaction.createdAt).toLocaleString()}
                    {transaction.paypalCaptureId ? ` · Capture ${transaction.paypalCaptureId}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-slate-100">{formatMoney(transaction.amountCents, transaction.currency)}</span>
                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize ${STATUS_STYLES[transaction.status] ?? STATUS_STYLES.refunded}`}>
                    {transaction.status}
                  </span>
                  {transaction.status === 'completed' && transaction.refundStatus !== 'completed' && (
                    <button
                      type="button"
                      disabled={Boolean(refundLoadingId) || ['processing', 'pending', 'review_required'].includes(transaction.refundStatus)}
                      onClick={() => requestRefund(transaction)}
                      className="rounded-lg border border-amber-300/15 px-2.5 py-1.5 text-xs font-semibold text-amber-100 hover:border-amber-300/40 disabled:opacity-40"
                    >
                      {refundLoadingId === transaction._id ? 'Requesting…' : transaction.refundStatus === 'pending' ? 'Refund pending' : transaction.refundStatus === 'review_required' ? 'Review required' : transaction.refundStatus === 'processing' ? 'Processing refund' : transaction.refundStatus === 'failed' ? 'Retry refund' : 'Refund'}
                    </button>
                  )}
                  {transaction.refundStatus === 'completed' && <span className="text-xs text-emerald-200">Refunded</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {data && (
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/6 pt-4 text-sm">
          <button type="button" disabled={page <= 1 || loading} onClick={() => { setLoading(true); setPage((value) => value - 1); }} className="rounded-lg border border-white/10 px-3 py-2 text-slate-300 hover:text-white disabled:opacity-40">Previous</button>
          <span className="text-center text-xs text-slate-500">Page {data.page} of {data.totalPages} · {data.items.length} shown · {data.total} matching</span>
          <button type="button" disabled={page >= data.totalPages || loading} onClick={() => { setLoading(true); setPage((value) => value + 1); }} className="rounded-lg border border-white/10 px-3 py-2 text-slate-300 hover:text-white disabled:opacity-40">Next</button>
        </footer>
      )}

      <section className="space-y-3 border-t border-white/6 pt-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="font-semibold text-white">Audit trail</h3>
            <p className="mt-1 text-xs text-slate-500">Recent account-specific payment, refund, and review events. Append-only records.</p>
          </div>
          <span className="text-xs text-slate-500">Latest {auditItems.length}</span>
        </div>
        {auditItems.length === 0
          ? <p className="rounded-xl border border-dashed border-white/10 p-5 text-center text-sm text-slate-500">No audit events yet.</p>
          : <ul className="divide-y divide-white/6">
            {auditItems.map((item) => (
              <li key={item._id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-medium capitalize text-slate-200">{item.action.replaceAll('.', ' ').replaceAll('_', ' ')}</p>
                  {item.meta?.signals?.map((signal) => <p key={signal.code} className="mt-1 text-xs text-amber-100">{signal.explanation}</p>)}
                  {item.meta?.transactionId && <p className="mt-1 text-[10px] text-slate-600">Transaction {item.meta.transactionId}</p>}
                </div>
                <time className="text-xs text-slate-500">{new Date(item.createdAt).toLocaleString()}</time>
              </li>
            ))}
          </ul>}
      </section>
    </section>
  );
}
