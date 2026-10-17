import { useCallback, useEffect, useState } from 'react';
import { Check, CircleAlert, RefreshCw, X } from 'lucide-react';
import {
  addPurchaseRequestComment, createApprovedPurchaseOrder, decidePurchaseRequest,
  cancelOrder, formatMoney, getPurchaseRequests,
} from '../services/api.js';
import { useAuth } from '../context/useAuth.js';
import Checkout from './PayPalCheckout.jsx';

const label = (status) => status.replaceAll('_', ' ');

export default function PurchaseRequests() {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [order, setOrder] = useState(null);
  const [comment, setComment] = useState({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    try {
      const response = await getPurchaseRequests();
      setRequests(response.requests ?? []);
      setLoading(false);
      setError('');
    } catch (err) {
      setLoading(false);
      setError(err.message || 'Could not load purchase requests.');
    }
  }, []);
  useEffect(() => {
    let ignore = false;
    getPurchaseRequests()
      .then((response) => {
        if (ignore) return;
        setRequests(response.requests ?? []);
        setLoading(false);
      })
      .catch((err) => {
        if (ignore) return;
        setError(err.message || 'Could not load purchase requests.');
        setLoading(false);
      });
    return () => { ignore = true; };
  }, []);

  async function decide(request, decision) {
    setBusyId(String(request._id));
    setError('');
    setNotice('');
    try {
      await decidePurchaseRequest(request._id, decision, comment[request._id] ?? '');
      setComment((old) => ({ ...old, [request._id]: '' }));
      await refresh();
      setNotice('Decision recorded in the approval history.');
    } catch (err) {
      setError(err.message || 'Could not update this purchase request.');
    } finally {
      setBusyId('');
    }
  }

  async function checkout(request) {
    setBusyId(String(request._id));
    setError('');
    try {
      const response = await createApprovedPurchaseOrder(request._id);
      setOrder(response.order);
    } catch (err) {
      setError(err.message || 'Could not start checkout for this approved request.');
    } finally {
      setBusyId('');
    }
  }

  async function cancelCheckout() {
    if (!order) return;
    setBusyId(String(order._id));
    setError('');
    try {
      await cancelOrder(order._id);
      setOrder(null);
      await refresh();
      setNotice('Checkout cancelled. The purchase request is closed.');
    } catch (err) {
      setError(err.message || 'Could not cancel checkout.');
    } finally {
      setBusyId('');
    }
  }

  async function addComment(request) {
    const text = (comment[request._id] ?? '').trim();
    if (!text) return;
    setBusyId(String(request._id));
    setError('');
    try {
      await addPurchaseRequestComment(request._id, text);
      setComment((old) => ({ ...old, [request._id]: '' }));
      await refresh();
    } catch (err) {
      setError(err.message || 'Could not add comment.');
    } finally {
      setBusyId('');
    }
  }

  return (
    <section className="space-y-5 rounded-2xl border border-white/10 bg-slate-900/80 p-5 text-slate-100 shadow-xl sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">Procurement workflow</p>
          <h2 className="mt-1 text-2xl font-bold text-white">Purchase requests</h2>
          <p className="mt-1 text-sm text-slate-400">Every purchase needs manager approval. Requests above ₹10,000 also go to Finance.</p>
        </div>
        <button type="button" onClick={refresh} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm hover:border-emerald-300/30 disabled:opacity-50">
          <RefreshCw size={15} /> Refresh
        </button>
      </header>

      {error && <p role="alert" className="rounded-lg border border-red-300/20 bg-red-300/6 p-3 text-sm text-red-200">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-emerald-300/20 bg-emerald-300/6 p-3 text-sm text-emerald-100">{notice}</p>}
      {order && (
        <Checkout
          order={order}
          onPaid={async () => { setOrder(null); setNotice('Payment verified and purchase recorded.'); await refresh(); }}
          onCancelOrder={cancelCheckout}
        />
      )}

      {loading ? <p className="text-sm text-slate-400" aria-live="polite">Loading requests…</p>
        : requests.length === 0 ? <p className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-slate-400">No purchase requests yet. Submit one from the marketplace or AI copilot.</p>
          : <div className="space-y-3">
            {requests.map((request) => {
              const requesterId = request.requester?._id ?? request.requester;
              const ownRequest = String(requesterId) === user?.id;
              const canDecide = !ownRequest && ((request.status === 'awaiting_manager' && ['admin', 'manager'].includes(user?.role))
                || (request.status === 'awaiting_finance' && ['admin', 'finance'].includes(user?.role)));
              return (
                <article key={request._id} className="space-y-3 rounded-xl border border-white/10 bg-slate-950/50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-white">{request.productName}</h3>
                      <p className="mt-1 text-xs text-slate-400">
                        {request.requester?.name ?? 'Requester'} · {request.department} · {request.seats} seats · {formatMoney(request.estimatedAmountCents, request.currency)}/month
                      </p>
                      <p className="mt-2 max-w-3xl text-sm text-slate-300">{request.justification}</p>
                    </div>
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${request.status === 'approved' || request.status === 'paid' ? 'border-emerald-300/20 bg-emerald-300/6 text-emerald-200' : 'border-amber-300/20 bg-amber-300/6 text-amber-100'}`}>
                      {label(request.status)}
                    </span>
                  </div>
                  {request.duplicateWarning && <p className="flex items-start gap-2 rounded-lg border border-amber-300/20 bg-amber-300/6 p-2 text-xs text-amber-100"><CircleAlert size={14} /> Possible duplicate or overlapping subscription detected. Review the organization’s existing tools before approving.</p>}

                  {(request.approvalHistory?.length > 0 || request.comments?.length > 0) && (
                    <details className="text-xs text-slate-400">
                      <summary className="cursor-pointer">Approval and discussion history</summary>
                      <ul className="mt-2 space-y-1">
                        {[...(request.approvalHistory ?? []), ...(request.comments ?? [])].map((event) => (
                          <li key={event._id}>{event.action} {event.fromStatus ? `(${label(event.fromStatus)} → ${label(event.toStatus)})` : ''}{event.comment ? ` — ${event.comment}` : ''}</li>
                        ))}
                      </ul>
                    </details>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <input
                      aria-label={`Comment for ${request.productName}`}
                      value={comment[request._id] ?? ''}
                      onChange={(event) => setComment((old) => ({ ...old, [request._id]: event.target.value }))}
                      maxLength={1000}
                      placeholder="Add a comment or decision note"
                      className="min-w-56 flex-1 rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-300/40"
                    />
                    <button type="button" onClick={() => addComment(request)} disabled={busyId === request._id || !(comment[request._id] ?? '').trim()} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold hover:border-white/30 disabled:opacity-50">Comment</button>
                  </div>

                  {canDecide && <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => decide(request, 'approve')} disabled={busyId === request._id} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-300 px-3 py-2 text-xs font-bold text-slate-950 disabled:opacity-50"><Check size={14} /> Approve</button>
                    <button type="button" onClick={() => decide(request, 'changes_requested')} disabled={busyId === request._id} className="rounded-lg border border-amber-200/20 px-3 py-2 text-xs font-semibold text-amber-100 disabled:opacity-50">Request changes</button>
                    <button type="button" onClick={() => decide(request, 'reject')} disabled={busyId === request._id} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200/20 px-3 py-2 text-xs font-semibold text-red-200 disabled:opacity-50"><X size={14} /> Reject</button>
                  </div>}
                  {request.status === 'approved' && ownRequest && (!request.purchaseOrder || request.purchaseOrder.status === 'approved') && <button type="button" onClick={() => checkout(request)} disabled={busyId === request._id} className="rounded-lg bg-emerald-300 px-4 py-2 text-xs font-bold text-slate-950 disabled:opacity-50">Continue to PayPal sandbox checkout</button>}
                  {request.status === 'approved' && request.purchaseOrder?.status === 'payment_created' && <p role="status" className="text-xs text-amber-100">Payment confirmation is in progress. Check transaction history before retrying.</p>}
                </article>
              );
            })}
          </div>}
    </section>
  );
}
