import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Clock3, RefreshCw, RotateCcw, ShieldCheck } from 'lucide-react';
import { getDeadOutboxEvents, retryDeadOutboxEvent } from '../services/api.js';

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

export default function PaymentRecovery() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [retryingId, setRetryingId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadEvents = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const response = await getDeadOutboxEvents();
      setEvents(Array.isArray(response?.events) ? response.events : []);
    } catch (err) {
      setError(err.message || 'Could not load failed payment events.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    getDeadOutboxEvents()
      .then((response) => {
        if (!cancelled) setEvents(Array.isArray(response?.events) ? response.events : []);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Could not load failed payment events.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  async function retryEvent(event) {
    const confirmed = window.confirm(
      `Queue this failed ${event.eventType.replaceAll('_', ' ')} event for another processing attempt? Check the related payment before retrying if the error suggests a payment-state mismatch.`,
    );
    if (!confirmed) return;
    setRetryingId(event.id);
    setError('');
    setNotice('');
    try {
      const response = await retryDeadOutboxEvent(event.id);
      setNotice(response?.message || 'Event queued for retry.');
      await loadEvents(true);
    } catch (err) {
      setError(err.message || 'Could not retry this event.');
    } finally {
      setRetryingId('');
    }
  }

  return (
    <section className="space-y-5 rounded-2xl border border-white/10 bg-slate-900/80 p-5 text-slate-100 shadow-xl shadow-black/10 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-200">Operations · Admin only</p>
          <h2 className="mt-1 text-2xl font-bold text-white">Payment recovery</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Inspect notification jobs that exhausted automatic retries. Retrying queues the job; it does not itself confirm or change a PayPal payment.
          </p>
        </div>
        <button type="button" onClick={() => loadEvents(true)} disabled={refreshing || loading} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-300 hover:border-emerald-300/30 hover:text-white disabled:opacity-40">
          <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} aria-hidden="true" />
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-white/5 bg-black/20 p-4">
          <p className="text-xs text-slate-500">Dead-letter jobs</p>
          <p className="mt-1 text-2xl font-bold text-white">{loading ? '—' : events.length}</p>
        </div>
        <div className="rounded-xl border border-white/5 bg-black/20 p-4">
          <p className="text-xs text-slate-500">Automatic retry limit</p>
          <p className="mt-1 text-2xl font-bold text-white">12 attempts</p>
        </div>
        <div className="rounded-xl border border-white/5 bg-black/20 p-4">
          <p className="text-xs text-slate-500">Manual retry limit</p>
          <p className="mt-1 text-2xl font-bold text-white">3 per event</p>
        </div>
      </div>

      {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-300/20 bg-red-300/5 p-3 text-sm text-red-200"><AlertTriangle size={17} className="mt-0.5 shrink-0" />{error}</div>}
      {notice && <p role="status" className="rounded-xl border border-emerald-300/15 bg-emerald-300/5 p-3 text-sm text-emerald-100">{notice}</p>}

      {loading ? <p className="py-8 text-center text-sm text-slate-400">Loading recovery queue…</p>
        : events.length === 0 && !error
          ? <div className="rounded-xl border border-dashed border-white/10 px-5 py-10 text-center">
              <ShieldCheck size={28} className="mx-auto text-emerald-200" aria-hidden="true" />
              <p className="mt-3 font-semibold text-white">No dead-letter jobs</p>
              <p className="mt-1 text-sm text-slate-500">There are no failed outbox jobs for this organization right now.</p>
            </div>
          : <div className="space-y-3">
              {events.map((event) => (
                <article key={event.id} className="space-y-3 rounded-xl border border-white/10 bg-slate-950/40 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-white">{event.eventType.replaceAll('_', ' ')}</h3>
                        <span className="rounded-full border border-red-300/20 bg-red-300/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-200">{event.status}</span>
                      </div>
                      <p className="mt-1 break-all text-xs text-slate-500">Event ID · {event.id}</p>
                      {event.orderId && <p className="mt-1 break-all text-xs text-slate-500">Order · {event.orderId}</p>}
                    </div>
                    <button type="button" onClick={() => retryEvent(event)} disabled={Boolean(retryingId)} className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-emerald-300 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-40">
                      <RotateCcw size={14} aria-hidden="true" />
                      {retryingId === event.id ? 'Queueing…' : 'Queue retry'}
                    </button>
                  </div>
                  <div className="grid gap-3 text-xs sm:grid-cols-3">
                    <div className="rounded-lg border border-white/5 p-3">
                      <p className="text-slate-500">Attempts</p>
                      <p className="mt-1 font-semibold text-slate-200">{event.attempts ?? 0}</p>
                    </div>
                    <div className="rounded-lg border border-white/5 p-3">
                      <p className="flex items-center gap-1 text-slate-500"><Clock3 size={12} /> Created</p>
                      <p className="mt-1 text-slate-200">{formatDate(event.createdAt)}</p>
                    </div>
                    <div className="rounded-lg border border-white/5 p-3">
                      <p className="flex items-center gap-1 text-slate-500"><Clock3 size={12} /> Last updated</p>
                      <p className="mt-1 text-slate-200">{formatDate(event.updatedAt)}</p>
                    </div>
                  </div>
                  {event.lastError && <div className="rounded-lg border border-amber-200/10 bg-amber-200/[0.03] p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-amber-100">Last error</p>
                    <p className="mt-1 break-words text-xs text-slate-300">{event.lastError}</p>
                  </div>}
                </article>
              ))}
            </div>}

      <p className="text-xs leading-5 text-slate-500">Privacy note: event payloads and processing tokens are not displayed. A retry can create work for the background processor; confirm the related payment state before manually retrying an event when the cause is unclear.</p>
    </section>
  );
}
