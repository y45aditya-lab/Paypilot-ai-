import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownToLine, ArrowRight, BadgeCheck, Check, CircleAlert, Layers3,
  LoaderCircle, Sparkles, TrendingUp, Wallet,
} from 'lucide-react';
import { cancelOrder, createPurchaseRequest, formatMoney, getProducts } from '../services/api.js';
import {
  buildProcurementBriefCsv,
  forecastStackGrowth,
  optimizeStack,
  PRODUCT_CATEGORIES,
} from '../services/stackOptimizer.js';
import PayPalCheckout from './PayPalCheckout.jsx';

const DEFAULT_CATEGORIES = ['project-management', 'communication'];
const cardClass = 'rounded-2xl border border-white/10 bg-white/4 p-5 backdrop-blur';

export default function StackPlanner() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [seats, setSeats] = useState(5);
  const [budget, setBudget] = useState(2000);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [order, setOrder] = useState(null);
  const [orderingId, setOrderingId] = useState(null);
  const [paidProduct, setPaidProduct] = useState('');
  const [requestNotice, setRequestNotice] = useState('');

  useEffect(() => {
    let ignore = false;
    getProducts()
      .then((response) => {
        if (!ignore) setProducts(Array.isArray(response?.products) ? response.products : []);
      })
      .catch((err) => {
        if (!ignore) setError(err.message || 'Could not load the live product catalog.');
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => { ignore = true; };
  }, []);

  const result = useMemo(() => {
    if (!products.length || categories.length === 0) return { plan: null, cheapest: null };
    return optimizeStack(products, categories, seats, Math.round(Number(budget) * 100));
  }, [products, categories, seats, budget]);
  const scenarios = useMemo(() => {
    if (!result.plan) return [];
    return forecastStackGrowth({
      products,
      categories,
      seats,
      budgetCents: Math.round(Number(budget) * 100),
      currentPlan: result.plan,
    });
  }, [products, categories, seats, budget, result.plan]);

  const totalAvailableFeatures = result.plan?.items.reduce(
    (total, item) => total + item.features,
    0,
  ) ?? 0;

  function toggleCategory(category) {
    setCategories((selected) =>
      selected.includes(category)
        ? selected.filter((item) => item !== category)
        : [...selected, category],
    );
    setError('');
  }

  async function handlePurchase(item) {
    setError('');
    setRequestNotice('');
    setPaidProduct('');
    setOrderingId(item.product._id);
    try {
      const justification = window.prompt(`Why does your team need ${item.product.name}? (5-1000 characters)`);
      if (justification === null) return;
      if (justification.trim().length < 5) {
        setError('Please enter a purchase justification of at least 5 characters.');
        return;
      }
      const response = await createPurchaseRequest({ productId: item.product._id, seats, justification: justification.trim() });
      setRequestNotice(`${response.request.productName} submitted for manager approval. Continue from Requests & approvals.`);
    } catch (err) {
      setError(err.message || 'Could not create this order.');
    } finally {
      setOrderingId(null);
    }
  }

  async function handleCancelOrder() {
    try {
      await cancelOrder(order._id);
      setOrder(null);
    } catch (err) {
      setError(err.message || 'Could not cancel this order.');
    }
  }

  function exportBrief() {
    const csv = buildProcurementBriefCsv({
      generatedAt: new Date().toISOString(),
      seats,
      categories,
      budgetCents: Math.round(Number(budget) * 100),
      plan: result.plan,
      cheapest: result.cheapest,
      scenarios,
    });
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `paypilot-procurement-brief-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6 text-slate-100">
      <section className="relative overflow-hidden rounded-3xl border border-emerald-400/20 bg-gradient-to-br from-emerald-400/15 via-slate-900 to-indigo-500/10 p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-12 -top-20 h-64 w-64 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="relative flex items-start gap-4">
          <div className="rounded-2xl bg-emerald-300/15 p-3 text-emerald-200">
            <Sparkles size={24} />
          </div>
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-emerald-200">Procurement intelligence</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Build your best-fit software stack.</h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              Set your team size, monthly cap, and the tools you need. The optimizer
              searches real catalog combinations, maximizes listed feature coverage,
              and shows the cheapest complete alternative.
            </p>
          </div>
        </div>
        <div className="relative mt-6 flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-300">
          <span className="inline-flex items-center gap-2"><Check size={14} className="text-emerald-300" />Budget-constrained combinations</span>
          <span className="inline-flex items-center gap-2"><Check size={14} className="text-emerald-300" />Transparent catalog-based scoring</span>
          <span className="inline-flex items-center gap-2"><Check size={14} className="text-emerald-300" />Human-approved checkout</span>
        </div>
      </section>

      <section className={`${cardClass} space-y-5`}>
        <div className="flex items-center gap-2">
          <Layers3 size={18} className="text-emerald-300" />
          <h3 className="font-semibold">Configure your plan</h3>
        </div>

        <fieldset>
          <legend className="mb-3 text-sm font-medium text-slate-300">What does your team need?</legend>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {PRODUCT_CATEGORIES.map(({ id, label }) => {
              const checked = categories.includes(id);
              return (
                <label
                  key={id}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-3 text-sm transition ${
                    checked
                      ? 'border-emerald-300/40 bg-emerald-300/10 text-white'
                      : 'border-white/10 bg-black/10 text-slate-400 hover:border-white/20'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleCategory(id)}
                    className="accent-emerald-400"
                  />
                  {label}
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block text-sm font-medium text-slate-300">
            Team seats
            <input
              type="number"
              min="1"
              max="1000"
              value={seats}
              onChange={(event) => setSeats(Math.min(1000, Math.max(1, Number(event.target.value) || 1)))}
              className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-emerald-300/70 focus:ring-2 focus:ring-emerald-400/20"
            />
            <span className="mt-1 block text-xs font-normal text-slate-500">Products outside their seat limits are excluded.</span>
          </label>
          <label className="block text-sm font-medium text-slate-300">
            Monthly budget (INR)
            <div className="relative mt-2">
              <Wallet size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="number"
                min="1"
                max="100000"
                step="1"
                value={budget}
                onChange={(event) => setBudget(Math.min(100000, Math.max(1, Number(event.target.value) || 1)))}
                className="w-full rounded-xl border border-white/10 bg-slate-950 py-3 pl-10 pr-4 text-white outline-none transition focus:border-emerald-300/70 focus:ring-2 focus:ring-emerald-400/20"
              />
            </div>
            <span className="mt-1 block text-xs font-normal text-slate-500">The plan never exceeds this recurring monthly cap.</span>
          </label>
        </div>
      </section>

      {error && <p role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">{error}</p>}
      {requestNotice && <p role="status" className="rounded-xl border border-emerald-300/20 bg-emerald-300/6 p-3 text-sm text-emerald-100">{requestNotice}</p>}
      {paidProduct && <p role="status" className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-200">Payment confirmed for {paidProduct}.</p>}

      {loading ? (
        <div className={`${cardClass} flex items-center gap-3 text-sm text-slate-300`}>
          <LoaderCircle size={18} className="animate-spin text-emerald-300" />Loading live catalog and calculating your options…
        </div>
      ) : categories.length === 0 ? (
        <div className={`${cardClass} text-sm text-slate-300`}>Choose at least one category to build a stack.</div>
      ) : result.plan ? (
        <>
          <section className="grid gap-3 sm:grid-cols-3">
            <Metric label="Monthly total" value={formatMoney(result.plan.monthlyCostCents)} detail={`${formatMoney(result.plan.monthlyCostCents * 12)} estimated annual run rate`} />
            <Metric label="Budget remaining" value={formatMoney(Math.round(Number(budget) * 100) - result.plan.monthlyCostCents)} detail={`of ${formatMoney(Math.round(Number(budget) * 100))} monthly`} />
            <Metric label="Catalog features" value={String(totalAvailableFeatures)} detail={`across ${result.plan.items.length} selected categories`} />
          </section>

          <section className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">Recommended combination</p>
                <h3 className="mt-1 text-xl font-semibold">More capability, within your cap</h3>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-xs text-slate-500">Sorted by listed feature count, then lower monthly cost</p>
                <button
                  type="button"
                  onClick={exportBrief}
                  className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-emerald-300/40 hover:bg-emerald-300/10 hover:text-emerald-100"
                >
                  <ArrowDownToLine size={14} />
                  Export procurement brief
                </button>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {result.plan.items.map((item) => (
                <ProductPlanCard
                  key={item.product._id}
                  item={item}
                  seats={seats}
                  ordering={orderingId === item.product._id}
                  checkoutPreparing={Boolean(orderingId || order)}
                  onPurchase={() => handlePurchase(item)}
                />
              ))}
            </div>
          </section>

          <GrowthAnalysis
            scenarios={scenarios}
            currentMonthlyCents={result.plan.monthlyCostCents}
            budgetCents={Math.round(Number(budget) * 100)}
          />

          {result.cheapest && result.cheapest.items.some(
            (item, index) => item.product._id !== result.plan.items[index].product._id,
          ) && (
            <section className={`${cardClass} border-indigo-300/20`}>
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-indigo-300/10 p-2 text-indigo-200"><ArrowRight size={18} /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-200">Lean alternative</p>
                  <h3 className="mt-1 font-semibold">Lowest-cost complete stack</h3>
                  <p className="mt-1 text-sm text-slate-400">
                    {formatMoney(result.cheapest.monthlyCostCents)}/month · saves {formatMoney(result.plan.monthlyCostCents - result.cheapest.monthlyCostCents)}/month
                    {' '}({formatMoney((result.plan.monthlyCostCents - result.cheapest.monthlyCostCents) * 12)}/year).
                  </p>
                  <p className="mt-3 text-sm text-slate-300">
                    {result.cheapest.items.map((item) => item.product.name).join(' · ')}
                    <span className="text-slate-500"> — {result.cheapest.features} listed features</span>
                  </p>
                </div>
              </div>
            </section>
          )}
        </>
      ) : (
        <section className={`${cardClass} border-amber-300/20`}>
          <h3 className="font-semibold text-amber-100">Your budget can’t cover this full stack yet</h3>
          <p className="mt-2 text-sm text-slate-300">
            {result.cheapest
              ? `The lowest-cost complete combination is ${formatMoney(result.cheapest.monthlyCostCents)}/month for ${seats} seats. Increase the budget or choose fewer categories.`
              : 'At least one selected category has no products available for this team size. Try another seat count or category.'}
          </p>
        </section>
      )}

      {order && (
        <PayPalCheckout
          order={order}
          onPaid={(paid) => { setPaidProduct(paid.productName); setOrder(null); }}
          onCancelOrder={handleCancelOrder}
        />
      )}
    </div>
  );
}

function GrowthAnalysis({ scenarios, currentMonthlyCents, budgetCents }) {
  return (
    <section className="space-y-4 rounded-2xl border border-cyan-300/15 bg-gradient-to-br from-cyan-300/7.000000000000001 to-white/2 p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-cyan-300/10 p-2.5 text-cyan-200"><TrendingUp size={19} /></div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-200">Plan for what’s next</p>
          <h3 className="mt-1 text-lg font-semibold text-white">Team-growth stress test</h3>
          <p className="mt-1 max-w-2xl text-sm leading-5 text-slate-400">
            See how the current stack scales, then check if a different catalog combination can keep future teams inside today’s budget.
          </p>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {scenarios.map((scenario) => {
          const optimized = scenario.optimizedPlan;
          const canKeepStack = scenario.fixedPlanMonthlyCents !== null;
          const scaleTarget = Math.max(budgetCents, currentMonthlyCents, optimized?.monthlyCostCents ?? 0, 1);
          const barWidth = optimized
            ? Math.min(100, optimized.monthlyCostCents / scaleTarget * 100)
            : Math.min(100, scenario.cheapestPlan?.monthlyCostCents / scaleTarget * 100 || 0);

          return (
            <article key={scenario.id} className="rounded-xl border border-white/10 bg-slate-950/55 p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-white">{scenario.label} team growth</span>
                <span className="rounded-full bg-white/7.000000000000001 px-2 py-1 text-xs text-slate-300">{scenario.forecastSeats} seats</span>
              </div>
              <div className="mt-4">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-slate-400">Best future fit</span>
                  <span className={optimized ? 'font-semibold text-cyan-100' : 'font-semibold text-amber-200'}>
                    {optimized
                      ? `${formatMoney(optimized.monthlyCostCents)}/mo`
                      : scenario.cheapestPlan
                        ? `${formatMoney(scenario.cheapestPlan.monthlyCostCents)}/mo minimum`
                        : 'Unavailable'}
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div
                    className={`h-full rounded-full ${optimized ? 'bg-cyan-300' : 'bg-amber-300'}`}
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
              </div>

              {optimized ? (
                <>
                  <p className="mt-3 text-xs leading-5 text-slate-400">
                    {canKeepStack
                      ? `Current stack would cost ${formatMoney(scenario.fixedPlanMonthlyCents)}/mo at this size.`
                      : 'The current stack exceeds a seat limit; a replacement stack is needed.'}
                  </p>
                  {canKeepStack && scenario.fixedPlanMonthlyCents > optimized.monthlyCostCents && (
                    <p className="mt-1 text-xs font-medium text-emerald-200">
                      Re-optimizing saves {formatMoney(scenario.fixedPlanMonthlyCents - optimized.monthlyCostCents)}/mo.
                    </p>
                  )}
                  <p className="mt-3 text-xs leading-5 text-slate-300">
                    <span className="text-slate-500">Optimized stack: </span>
                    {optimized.items.map((item) => item.product.name).join(' · ')}
                  </p>
                  <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-emerald-200">
                    <BadgeCheck size={14} />Within current monthly budget
                  </p>
                </>
              ) : (
                <p className="mt-3 inline-flex items-start gap-1.5 text-xs leading-5 text-amber-200">
                  <CircleAlert size={14} className="mt-0.5 shrink-0" />
                  {scenario.cheapestPlan
                    ? `The cheapest full stack is ${formatMoney(scenario.cheapestPlan.monthlyCostCents)}/mo, ${formatMoney(scenario.cheapestPlan.monthlyCostCents - budgetCents)} above today’s budget.`
                    : 'No complete stack is available for this team size.'}
                </p>
              )}

              {optimized && (
                <p className="mt-2 text-[11px] text-slate-500">
                  {formatMoney(optimized.monthlyCostCents * 12)}/year at projected team size
                </p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function Metric({ label, value, detail }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/4 p-4">
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight text-white">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

function ProductPlanCard({ item, seats, ordering, checkoutPreparing, onPurchase }) {
  const { product, monthlyCostCents, features } = item;
  const price = product.pricingModel === 'per_seat'
    ? `${formatMoney(product.unitPriceCents)} per seat`
    : 'flat price';

  return (
    <article className="rounded-2xl border border-white/10 bg-slate-900/80 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-300">{product.category.replaceAll('-', ' ')}</p>
          <h4 className="mt-1 text-lg font-semibold text-white">{product.name}</h4>
        </div>
        <span className="shrink-0 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2.5 py-1 text-xs text-emerald-200">
          {features} features
        </span>
      </div>
      <p className="mt-2 text-sm leading-5 text-slate-400">{product.description}</p>
      <div className="mt-4 flex items-baseline justify-between border-t border-white/10 pt-4">
        <span className="text-xs text-slate-500">{price}{product.pricingModel === 'per_seat' ? ` × ${seats} seats` : ''}</span>
        <span className="text-lg font-semibold text-white">{formatMoney(monthlyCostCents)}<span className="text-xs font-normal text-slate-400">/mo</span></span>
      </div>
      {features > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {product.features.slice(0, 4).map((feature) => (
            <li key={feature} className="rounded-md bg-white/6 px-2 py-1 text-xs text-slate-300">{feature}</li>
          ))}
          {features > 4 && <li className="px-1 py-1 text-xs text-slate-500">+{features - 4} more</li>}
        </ul>
      )}
      <button
        type="button"
        onClick={onPurchase}
        disabled={ordering || checkoutPreparing}
        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-300 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {ordering ? <LoaderCircle size={16} className="animate-spin" /> : null}
        {ordering ? 'Preparing checkout…' : checkoutPreparing ? 'Checkout in progress' : 'Choose this plan'}
      </button>
    </article>
  );
}
