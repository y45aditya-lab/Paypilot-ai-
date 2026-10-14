import { formatMoney } from '../services/api.js';

export default function RecommendationResult({ result }) {
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
    <div className="space-y-4 rounded-xl border border-emerald-200 bg-white p-5 shadow-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Recommended</p>
        <h3 className="text-lg font-bold">{quote.product.name}</h3>
        <p className="text-sm text-slate-600">{quote.product.description}</p>
      </div>

      <dl className="grid grid-cols-2 gap-2 text-sm">
        <dt className="text-slate-500">Seats</dt>
        <dd className="text-right">{quote.seats}</dd>
        <dt className="text-slate-500">
          {quote.pricingModel === 'per_seat' ? 'Price per seat' : 'Flat price'}
        </dt>
        <dd className="text-right">{formatMoney(quote.unitPriceCents, quote.currency)}/mo</dd>
        <dt className="font-semibold">Monthly total</dt>
        <dd className="text-right font-semibold">{formatMoney(quote.totalCents, quote.currency)}</dd>
        <dt className="text-slate-500">Budget</dt>
        <dd className="text-right">{formatMoney(quote.budgetCents, quote.currency)}</dd>
        <dt className="text-slate-500">Remaining</dt>
        <dd className="text-right text-emerald-700">{formatMoney(quote.remainingCents, quote.currency)}</dd>
      </dl>

      <ul className="list-inside list-disc text-sm text-slate-700">
        {quote.product.features.map((f) => <li key={f}>{f}</li>)}
      </ul>

      <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
        <p className="mb-1 font-semibold">Why this option</p>
        <p>{reasoning}</p>
      </div>

      <p className="text-xs text-slate-500">Demo catalog item. No real purchase will be made.</p>
    </div>
  );
}