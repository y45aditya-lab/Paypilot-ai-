import { formatMoney } from '../services/api.js';

export default function RecommendationResult({ result, alternatives = [], onApprove, approving }) {
  if (!result.ok) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        <p className="mb-1 font-semibold">No suitable option</p>
        <p>{result.reason}</p>
      </div>
    );
  }

  const { quote, reasoning } = result;
  return (
    <div className="space-y-5 rounded-2xl border border-emerald-300/20 bg-slate-900/80 p-5 text-slate-100 shadow-xl shadow-black/10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">AI recommendation · {quote.product.category.replaceAll('-', ' ')}</p>
          <h3 className="mt-1 text-xl font-bold">{quote.product.name}</h3>
          <p className="mt-1 text-sm text-slate-400">{quote.product.description}</p>
        </div>
        <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5 text-xs text-emerald-100">
          {quote.seats} seats · server priced
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-3 rounded-xl bg-black/20 p-4 text-sm sm:grid-cols-4">
        <dt className="text-slate-500">Seats</dt>
        <dd className="text-right text-slate-200">{quote.seats}</dd>
        <dt className="text-slate-500">
          {quote.pricingModel === 'per_seat' ? 'Price per seat' : 'Flat price'}
        </dt>
        <dd className="text-right text-slate-200">{formatMoney(quote.unitPriceCents, quote.currency)}/mo</dd>
        <dt className="font-semibold text-white">Monthly total</dt>
        <dd className="text-right font-semibold text-white">{formatMoney(quote.totalCents, quote.currency)}</dd>
        <dt className="text-slate-500">Budget</dt>
        <dd className="text-right text-slate-200">{formatMoney(quote.budgetCents, quote.currency)}</dd>
        <dt className="text-slate-500">Remaining</dt>
        <dd className="text-right text-emerald-200">{formatMoney(quote.remainingCents, quote.currency)}</dd>
      </dl>

      <ul className="flex flex-wrap gap-2">
        {quote.product.features.map((feature) => (
          <li key={feature} className="rounded-lg bg-white/6 px-2.5 py-1.5 text-xs text-slate-300">{feature}</li>
        ))}
      </ul>

      <div className="rounded-xl border border-white/5 bg-white/4 p-4 text-sm text-slate-300">
        <p className="mb-1 font-semibold text-white">Why the copilot picked it</p>
        <p className="leading-6">{reasoning}</p>
        {result.mode === 'catalog-fallback' && <p className="mt-3 rounded-lg border border-amber-300/10 bg-amber-300/4 px-3 py-2 text-xs text-amber-100">AI provider unavailable · using verified live-catalog matching instead.</p>}
      </div>

      <div className="rounded-lg border border-amber-300/10 bg-amber-300/6 px-3 py-2 text-xs text-amber-100">
        Submitting creates a purchase request. PayPal Sandbox checkout unlocks only after required manager and finance approvals.
      </div>
      {onApprove && <button
        type="button"
        onClick={() => onApprove({ product: { id: quote.product.id }, seats: quote.seats })}
        disabled={approving}
        className="w-full rounded-xl bg-emerald-300 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-200 disabled:cursor-wait disabled:opacity-50"
      >
        {approving ? 'Submitting request…' : `Request approval for ${quote.product.name} · ${formatMoney(quote.totalCents, quote.currency)}/mo`}
      </button>}

      {alternatives.length > 0 && (
        <section className="space-y-3 border-t border-white/10 pt-5">
          <div>
            <h4 className="font-semibold text-white">Compare other eligible options</h4>
            <p className="mt-1 text-xs text-slate-500">Same category, seat count and budget. Prices are from the live catalog.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {alternatives.map(({ product, totalCents }) => (
              <article key={product._id} className="rounded-xl border border-white/10 bg-slate-950/60 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h5 className="font-semibold text-white">{product.name}</h5>
                    <p className="mt-1 text-xs leading-5 text-slate-400">{product.description}</p>
                  </div>
                  <span className="whitespace-nowrap text-sm font-semibold text-white">{formatMoney(totalCents, product.currency)}/mo</span>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {product.pricingModel === 'per_seat' ? `${formatMoney(product.unitPriceCents, product.currency)} × ${quote.seats} seats` : 'Flat monthly price'}
                  {' · '}{product.features.length} listed features
                </p>
                <button
                  type="button"
                  onClick={() => onApprove?.({ product: { id: product._id }, seats: quote.seats })}
                  disabled={!onApprove || approving}
                  className="mt-3 w-full rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-emerald-300/30 hover:text-emerald-100 disabled:opacity-50"
                >
                  {approving ? 'Submitting…' : `Request ${product.name}`}
                </button>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}