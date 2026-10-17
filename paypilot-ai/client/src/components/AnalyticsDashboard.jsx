import { useEffect, useMemo, useState } from 'react';
import { formatMoney, getAnalytics, getDepartmentReport } from '../services/api.js';
import { useAuth } from '../context/useAuth.js';

function labelStatus(value) {
  return value.replaceAll('_', ' ');
}

export default function AnalyticsDashboard() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState([]);
  const { user } = useAuth();

  useEffect(() => {
    let ignore = false;
    Promise.all([
      getAnalytics({ days }),
      ['admin', 'finance'].includes(user?.role) ? getDepartmentReport() : Promise.resolve({ departments: [] }),
    ])
      .then(([response, departmentData]) => {
        if (!ignore) {
          setData(response);
          setDepartments(departmentData.departments ?? []);
          setError('');
        }
      })
      .catch((err) => {
        if (!ignore) setError(err.message || 'Could not load analytics.');
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => { ignore = true; };
  }, [days, user?.role]);

  const currencies = useMemo(() => [...new Set((data?.trend ?? []).map((item) => item.currency))], [data]);
  const trendsByCurrency = useMemo(() => Object.fromEntries(currencies.map((currency) => {
    const byDay = new Map();
    for (const item of data?.trend ?? []) {
      if (item.currency !== currency) continue;
      const current = byDay.get(item.day) ?? { day: item.day, grossCents: 0, refundedCents: 0 };
      if (item.status === 'completed') current.grossCents += item.amountCents;
      if (item.status === 'refunded') current.refundedCents += item.amountCents;
      byDay.set(item.day, current);
    }
    return [currency, [...byDay.values()]];
  })), [currencies, data]);

  return (
    <section className="space-y-5 rounded-2xl border border-white/10 bg-slate-900/80 p-5 text-slate-100 shadow-xl shadow-black/10 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">Spend intelligence</p>
          <h2 className="mt-1 text-2xl font-bold text-white">Analytics & review signals</h2>
          <p className="mt-1 text-sm text-slate-400">Account-scoped verified payments, refunds, order states and explainable review signals.</p>
        </div>
        <label className="text-xs font-semibold text-slate-400">
          Reporting window
          <select value={days} onChange={(event) => { setLoading(true); setDays(Number(event.target.value)); }} className="mt-1 block rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white">
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={365}>Last 12 months</option>
          </select>
        </label>
      </header>

      {error && <p role="alert" className="rounded-lg border border-red-300/15 bg-red-300/6 p-3 text-sm text-red-200">{error}</p>}
      {loading && !data && <p className="py-8 text-center text-sm text-slate-400">Loading account analytics…</p>}
      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {(data.summary ?? []).length === 0
              ? <p className="rounded-xl border border-white/5 bg-black/20 p-4 text-sm text-slate-400">No verified transactions in this reporting window.</p>
              : data.summary.map((item) => (
                <article key={item.currency} className="rounded-xl border border-white/5 bg-black/20 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{item.currency} · net verified spend</p>
                  <p className="mt-2 text-2xl font-bold text-white">{item.netCents === null ? 'Needs review' : formatMoney(item.netCents, item.currency)}</p>
                  <p className="mt-2 text-xs text-slate-400">{item.completedCount} completed · {item.refundedCount} refunded</p>
                  <p className="mt-1 text-[11px] text-slate-500">Gross {formatMoney(item.grossCents, item.currency)} · refunds {formatMoney(item.refundedCents, item.currency)}</p>
                  {item.refundReviewCount > 0 && <p className="mt-2 text-xs text-amber-200">{item.refundReviewCount} refund(s) require reconciliation; net is not estimated.</p>}
                </article>
              ))}
            {data.summary.map((item) => (
              <article key={`${item.currency}-ops`} className="rounded-xl border border-white/5 bg-black/20 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{item.currency} · payment exceptions</p>
                <p className="mt-2 text-2xl font-bold text-white">{item.failedCount + item.pendingCount}</p>
                <p className="mt-2 text-xs text-slate-400">{item.pendingCount} pending · {item.failedCount} failed</p>
              </article>
            ))}
          </div>

          <section className="rounded-xl border border-white/5 bg-black/20 p-4">
            <h3 className="font-semibold text-white">Order lifecycle · this window</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {data.orderStatuses.length > 0
                ? data.orderStatuses.map((item) => (
                  <span key={item.status} className="rounded-lg border border-white/10 px-3 py-2 text-xs capitalize text-slate-300">
                    {labelStatus(item.status)} <strong className="ml-1 text-white">{item.count}</strong>
                  </span>
                ))
                : <p className="text-sm text-slate-500">No orders created in this period.</p>}
            </div>
          </section>

          {['admin', 'finance'].includes(user?.role) && (
            <section className="rounded-xl border border-white/5 bg-black/20 p-4">
              <h3 className="font-semibold text-white">Department budgets · this month</h3>
              {departments.length === 0 ? <p className="mt-3 text-sm text-slate-500">No purchase orders or monthly department budgets yet.</p>
                : <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[36rem] text-left text-xs">
                  <thead className="text-slate-500"><tr><th className="py-2">Department</th><th>Committed</th><th>Paid</th><th>Budget</th><th>Remaining</th></tr></thead>
                  <tbody>{departments.map((item) => <tr key={`${item.department}-${item.currency}`} className="border-t border-white/5 text-slate-300">
                    <th scope="row" className="py-2 font-medium">{item.department} · {item.currency}</th>
                    <td>{formatMoney(item.committedCents, item.currency)}</td>
                    <td>{formatMoney(item.paidCents, item.currency)}</td>
                    <td>{item.budgetCents == null ? 'Not set' : formatMoney(item.budgetCents, item.currency)}</td>
                    <td>{item.remainingCents == null ? '—' : formatMoney(item.remainingCents, item.currency)}</td>
                  </tr>)}</tbody>
                </table></div>}
            </section>
          )}

          <section className="space-y-3">
            <div>
              <h3 className="font-semibold text-white">Verified spend trend</h3>
              <p className="mt-1 text-xs text-slate-500">Gross charges and refunds are plotted separately; currency totals are never combined.</p>
            </div>
            {currencies.length === 0
              ? <p className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-slate-500">No completed payment activity to plot.</p>
              : currencies.map((currency) => {
                const points = trendsByCurrency[currency];
                const max = Math.max(1, ...points.map((point) => point.grossCents));
                return (
                  <div key={currency} className="rounded-xl border border-white/5 bg-black/20 p-4">
                    <p className="text-xs font-semibold text-slate-300">{currency}</p>
                    <div className="mt-4 flex h-36 items-end gap-1 overflow-x-auto" aria-label={`${currency} daily verified spend trend`}>
                      {points.map((point) => (
                        <div key={point.day} title={`${point.day} · gross ${formatMoney(point.grossCents, currency)} · refunded ${formatMoney(point.refundedCents, currency)}`} className="flex min-w-6 flex-1 flex-col items-center justify-end gap-1">
                          {point.refundedCents > 0 && <div className="w-full rounded-t bg-amber-300/70" style={{ height: `${Math.max(3, (point.refundedCents / max) * 100)}%` }} />}
                          <div className="w-full rounded-t bg-emerald-300" style={{ height: `${Math.max(3, (point.grossCents / max) * 100)}%` }} />
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-right text-[10px] text-slate-500">{points.length} active days · green charges · amber refunds</p>
                  </div>
                );
              })}
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border border-white/5 bg-black/20 p-4">
              <h3 className="font-semibold text-white">Top products</h3>
              {data.topProducts.length === 0
                ? <p className="mt-3 text-sm text-slate-500">No completed purchases in this period.</p>
                : <ul className="mt-3 divide-y divide-white/6">
                  {data.topProducts.map((item) => (
                    <li key={`${item.productName}-${item.currency}`} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <span className="min-w-0 truncate text-slate-300">{item.productName}<span className="ml-2 text-xs text-slate-500">{item.count} ×</span></span>
                      <span className="shrink-0 font-semibold text-white">{formatMoney(item.amountCents, item.currency)}</span>
                    </li>
                  ))}
                </ul>}
            </section>
            <section className="rounded-xl border border-amber-300/10 bg-amber-300/4 p-4">
              <h3 className="font-semibold text-white">Explainable risk review signals</h3>
              <p className="mt-1 text-xs text-slate-500">Signals are rules-based prompts for human review, not fraud findings.</p>
              {data.riskAlerts.length === 0
                ? <p className="mt-4 text-sm text-slate-400">No review signals for this window.</p>
                : <ul className="mt-3 space-y-3">
                  {data.riskAlerts.map((alert, index) => (
                    <li key={`${alert.orderId}-${alert.createdAt}-${index}`} className="rounded-lg border border-white/5 bg-black/20 p-3">
                      <p className="text-xs text-slate-500">{new Date(alert.createdAt).toLocaleString()}</p>
                      <ul className="mt-2 space-y-1">
                        {alert.signals.map((signal) => <li key={signal.code} className="text-sm text-amber-100">{signal.explanation}</li>)}
                      </ul>
                    </li>
                  ))}
                </ul>}
            </section>
          </div>
          <p className="text-right text-[10px] text-slate-600">Generated {new Date(data.generatedAt).toLocaleString()} · {data.days}-day window</p>
        </>
      )}
    </section>
  );
}
