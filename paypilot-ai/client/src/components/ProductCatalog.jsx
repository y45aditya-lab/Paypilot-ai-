import { useEffect, useMemo, useState } from 'react';
import { cancelOrder, createPurchaseRequest, formatMoney, getProducts } from '../services/api.js';
import { PRODUCT_CATEGORIES } from '../services/stackOptimizer.js';
import PayPalCheckout from './PayPalCheckout.jsx';

function productCost(product, seats) {
  if (seats < (product.minSeats ?? 1) || seats > (product.maxSeats ?? 10000)) return null;
  return product.pricingModel === 'per_seat' ? product.unitPriceCents * seats : product.unitPriceCents;
}

function getCategoryLabel(category) {
  return PRODUCT_CATEGORIES.find((item) => item.id === category)?.label ?? category.replaceAll('-', ' ');
}

export default function ProductCatalog() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState('value');
  const [seats, setSeats] = useState(5);
  const [budget, setBudget] = useState('2000');
  const [comparedIds, setComparedIds] = useState([]);
  const [compareError, setCompareError] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderError, setOrderError] = useState('');
  const [requestNotice, setRequestNotice] = useState('');
  const [order, setOrder] = useState(null);
  const [paidOrder, setPaidOrder] = useState(null);

  useEffect(() => {
    let ignore = false;
    getProducts()
      .then((response) => {
        const loadedProducts = Array.isArray(response) ? response : response.products;
        if (!Array.isArray(loadedProducts)) throw new Error('The catalog response was not in the expected format.');
        if (!ignore) {
          setProducts(loadedProducts.filter((product) => product.active !== false && product.currency === 'INR'));
          setError('');
        }
      })
      .catch((err) => {
        if (!ignore) {
          setProducts([]);
          setError(err.message || 'Could not load products. Please try again.');
        }
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => { ignore = true; };
  }, [refreshKey]);

  function retryLoading() {
    setLoading(true);
    setRefreshKey((value) => value + 1);
  }

  const categoryCounts = useMemo(() => products.reduce((counts, product) => {
    counts[product.category] = (counts[product.category] ?? 0) + 1;
    return counts;
  }, {}), [products]);

  const visibleProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const maxBudgetCents = budget === '' ? null : Number(budget) * 100;
    return products
      .filter((product) => !category || product.category === category)
      .filter((product) => !normalizedQuery
        || [product.name, product.description, product.category, ...(product.features ?? [])]
          .some((value) => String(value).toLowerCase().includes(normalizedQuery)))
      .filter((product) => {
        if (maxBudgetCents === null) return true;
        const cost = productCost(product, seats);
        return cost !== null && cost <= maxBudgetCents;
      })
      .sort((a, b) => {
        const aCost = productCost(a, seats);
        const bCost = productCost(b, seats);
        if (aCost === null || bCost === null) {
          if (aCost === bCost) return 0;
          return aCost === null ? 1 : -1;
        }
        if (sort === 'price-low') return aCost - bCost;
        if (sort === 'price-high') return bCost - aCost;
        if (sort === 'features') return (b.features?.length ?? 0) - (a.features?.length ?? 0);
        const aValue = (a.features?.length ?? 0) / Math.max(aCost, 1);
        const bValue = (b.features?.length ?? 0) / Math.max(bCost, 1);
        return bValue - aValue || aCost - bCost;
      });
  }, [products, query, category, sort, seats, budget]);

  const comparedProducts = useMemo(
    () => comparedIds.map((id) => products.find((product) => product._id === id)).filter(Boolean),
    [comparedIds, products],
  );

  function toggleCompared(product) {
    setCompareError('');
    if (comparedIds.includes(product._id)) {
      setComparedIds(comparedIds.filter((id) => id !== product._id));
      return;
    }
    if (comparedIds.length >= 3) {
      setCompareError('Compare up to three products at a time.');
      return;
    }
    setComparedIds([...comparedIds, product._id]);
  }

  async function handleCreateOrder(product) {
    try {
      const justification = window.prompt(`Why does your team need ${product.name}? (5-1000 characters)`);
      if (justification === null) return;
      if (justification.trim().length < 5) {
        setOrderError('Please enter a purchase justification of at least 5 characters.');
        return;
      }
      setOrderLoading(true);
      setOrderError('');
      setRequestNotice('');
      setOrder(null);
      setPaidOrder(null);
      const result = await createPurchaseRequest({ productId: product._id, seats, justification: justification.trim() });
      setRequestNotice(`${result.request.productName} submitted for manager approval. Follow its status in Requests & approvals.`);
    } catch (err) {
      setOrderError(err.message || 'Could not create payment order.');
    } finally {
      setOrderLoading(false);
    }
  }

  async function handleCancelOrder() {
    try {
      await cancelOrder(order._id);
      setOrder(null);
      setOrderError('');
    } catch (err) {
      setOrderError(err.message || 'Could not cancel this order.');
    }
  }

  const inputClass = 'rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-emerald-300/60 focus:ring-2 focus:ring-emerald-300/10';

  if (loading) {
    return <section className="rounded-2xl border border-white/10 bg-slate-900 p-6 text-sm text-slate-400" aria-live="polite">Loading the live marketplace…</section>;
  }

  if (error) {
    return (
      <section className="rounded-2xl border border-red-300/20 bg-slate-900 p-6">
        <p role="alert" className="text-sm text-red-200">{error}</p>
        <button type="button" onClick={retryLoading} className="mt-3 rounded-lg border border-white/10 px-3 py-2 text-sm text-white hover:border-emerald-300/30">Try again</button>
      </section>
    );
  }

  return (
    <section className="space-y-5 rounded-2xl border border-white/10 bg-slate-900/80 p-5 text-slate-100 shadow-xl shadow-black/10 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">Software marketplace</p>
          <h2 className="mt-1 text-2xl font-bold text-white">Find the right tools for your team</h2>
          <p className="mt-1 text-sm text-slate-400">Compare catalog pricing and request approval before any PayPal checkout.</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-right">
          <p className="text-xs text-slate-500">Live catalog</p>
          <p className="font-semibold text-white">{products.length} products</p>
        </div>
      </header>

      <div className="grid gap-3 rounded-2xl border border-white/5 bg-black/20 p-4 sm:grid-cols-2 xl:grid-cols-4">
        <label className="text-xs font-semibold text-slate-400">
          Search catalog
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Product, feature, workflow…" className={`${inputClass} mt-2 w-full`} />
        </label>
        <label className="text-xs font-semibold text-slate-400">
          Team seats
          <input type="number" min="1" max="1000" value={seats} onChange={(event) => setSeats(Math.min(1000, Math.max(1, Number(event.target.value) || 1)))} className={`${inputClass} mt-2 w-full`} />
        </label>
        <label className="text-xs font-semibold text-slate-400">
          Maximum monthly spend · INR
          <input type="number" min="0" step="0.01" value={budget} onChange={(event) => setBudget(event.target.value)} placeholder="No limit" className={`${inputClass} mt-2 w-full`} />
        </label>
        <label className="text-xs font-semibold text-slate-400">
          Sort by
          <select value={sort} onChange={(event) => setSort(event.target.value)} className={`${inputClass} mt-2 w-full`}>
            <option value="value">Most features per rupee</option>
            <option value="price-low">Lowest monthly price</option>
            <option value="price-high">Highest monthly price</option>
            <option value="features">Most listed features</option>
          </select>
        </label>
      </div>

      <nav aria-label="Marketplace categories" className="flex gap-2 overflow-x-auto pb-1">
        <button type="button" onClick={() => setCategory('')} aria-pressed={!category} className={`shrink-0 rounded-full border px-3 py-2 text-xs font-semibold ${!category ? 'border-emerald-300/40 bg-emerald-300/10 text-emerald-100' : 'border-white/10 text-slate-400 hover:text-white'}`}>
          All tools · {products.length}
        </button>
        {PRODUCT_CATEGORIES.map((item) => (
          <button key={item.id} type="button" onClick={() => setCategory(item.id)} aria-pressed={category === item.id} className={`shrink-0 rounded-full border px-3 py-2 text-xs font-semibold ${category === item.id ? 'border-emerald-300/40 bg-emerald-300/10 text-emerald-100' : 'border-white/10 text-slate-400 hover:text-white'}`}>
            {item.label} · {categoryCounts[item.id] ?? 0}
          </button>
        ))}
      </nav>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-400">{visibleProducts.length} matching {visibleProducts.length === 1 ? 'product' : 'products'} · prices shown for {seats} {seats === 1 ? 'seat' : 'seats'}</p>
        <p className="text-xs text-slate-500">Compare up to 3 · all prices are monthly estimates</p>
      </div>

      {visibleProducts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 p-8 text-center">
          <p className="font-semibold text-white">No products match those filters</p>
          <p className="mt-1 text-sm text-slate-500">Try another category, a higher budget, or a different team size.</p>
          <button type="button" onClick={() => { setQuery(''); setCategory(''); setBudget(''); }} className="mt-4 text-sm font-semibold text-emerald-200 underline underline-offset-4">Clear filters</button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visibleProducts.map((product) => {
            const total = productCost(product, seats);
            const inComparison = comparedIds.includes(product._id);
            return (
              <article key={product._id} className="flex flex-col rounded-2xl border border-white/10 bg-slate-950/70 p-5 transition hover:border-emerald-300/20">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-300">{getCategoryLabel(product.category)}</span>
                    <h3 className="mt-1 text-lg font-bold text-white">{product.name}</h3>
                  </div>
                  <button type="button" onClick={() => toggleCompared(product)} aria-pressed={inComparison} className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${inComparison ? 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100' : 'border-white/10 text-slate-400 hover:text-white'}`}>
                    {inComparison ? 'Compared ✓' : 'Compare'}
                  </button>
                </div>
                <p className="mt-3 min-h-12 text-sm leading-6 text-slate-400">{product.description || 'Catalog listing with transparent monthly pricing.'}</p>
                <div className="mt-4 flex items-end justify-between gap-3 border-t border-white/5 pt-4">
                  <div>
                    <p className="text-2xl font-bold text-white">{total === null ? '—' : formatMoney(total, product.currency)}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {total === null
                        ? `Available for ${product.minSeats ?? 1}–${product.maxSeats ?? 'unlimited'} seats`
                        : `${product.pricingModel === 'per_seat' ? `${formatMoney(product.unitPriceCents, product.currency)} × ${seats} seats` : 'Flat monthly price'} · / month`}
                    </p>
                  </div>
                  <span className="text-right text-xs text-slate-500">{product.features?.length ?? 0}<br />features</span>
                </div>
                {product.features?.length > 0 && (
                  <ul className="mt-4 flex flex-wrap gap-1.5">
                    {product.features.slice(0, 4).map((feature) => <li key={feature} className="rounded-md bg-white/5 px-2 py-1 text-[11px] text-slate-300">{feature}</li>)}
                  </ul>
                )}
                {product.vendorOffers?.length > 0 && (
                  <div className="mt-4 rounded-lg border border-white/6 bg-white/2.5 p-3">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Vendor comparison · monthly quote</p>
                    <ul className="space-y-2">
                      {product.vendorOffers.slice(0, 3).map((offer) => (
                        <li key={offer.id} className="flex items-center justify-between gap-2 text-xs">
                          <span className="truncate text-slate-300">{offer.vendor.name}</span>
                          <span className="shrink-0 font-medium text-white">{formatMoney(offer.priceCents, offer.currency)}</span>
                          <span className={`shrink-0 ${offer.availability === 'out_of_stock' ? 'text-red-300' : offer.availability === 'limited' ? 'text-amber-200' : 'text-emerald-200'}`}>
                            {offer.availability === 'out_of_stock' ? 'Out of stock' : `${offer.stockQuantity} available`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedProduct(product)}
                  disabled={total === null || Boolean(order) || orderLoading}
                  className="mt-5 w-full rounded-xl bg-emerald-300 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {total === null ? 'Not available for these seats' : order ? 'Checkout in progress' : 'Select for checkout'}
                </button>
              </article>
            );
          })}
        </div>
      )}

      {compareError && <p role="alert" className="text-sm text-amber-200">{compareError}</p>}
      {comparedProducts.length > 0 && (
        <section className="space-y-3 rounded-2xl border border-emerald-300/15 bg-emerald-300/4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-bold text-white">Side-by-side comparison</h3>
              <p className="mt-1 text-xs text-slate-500">For {seats} seats · based on catalog pricing and listed features.</p>
            </div>
            <button type="button" onClick={() => setComparedIds([])} className="text-xs text-slate-400 underline underline-offset-4 hover:text-white">Clear comparison</button>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {comparedProducts.map((product) => {
              const total = productCost(product, seats);
              return (
                <article key={product._id} className="rounded-xl border border-white/10 bg-slate-950/70 p-4">
                  <p className="text-xs text-emerald-200">{getCategoryLabel(product.category)}</p>
                  <h4 className="mt-1 font-semibold text-white">{product.name}</h4>
                  <p className="mt-3 text-xl font-bold text-white">{total === null ? 'Seat count unavailable' : formatMoney(total, product.currency)}</p>
                  <p className="text-xs text-slate-500">per month · {product.features?.length ?? 0} listed features</p>
                  <button type="button" disabled={total === null || Boolean(order) || orderLoading} onClick={() => setSelectedProduct(product)} className="mt-3 w-full rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-emerald-300/30 disabled:opacity-40">Select this product</button>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {selectedProduct && (
        <section className="space-y-3 rounded-2xl border border-emerald-300/20 bg-emerald-300/5 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-emerald-300">Review before checkout</p>
              <h3 className="mt-1 text-lg font-bold text-white">{selectedProduct.name}</h3>
              <p className="mt-1 text-sm text-slate-400">{seats} seats · estimated {formatMoney(productCost(selectedProduct, seats), selectedProduct.currency)}/month</p>
            </div>
            <button type="button" onClick={() => setSelectedProduct(null)} className="text-sm text-slate-400 underline underline-offset-4 hover:text-white">Dismiss</button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => handleCreateOrder(selectedProduct)} disabled={orderLoading || Boolean(order) || Boolean(requestNotice)} className="rounded-xl bg-emerald-300 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-emerald-200 disabled:opacity-50">
              {orderLoading ? 'Submitting request…' : 'Request purchase approval'}
            </button>
            <p className="text-xs text-slate-500">The server validates product, seat count and price. Checkout unlocks only after approval.</p>
          </div>
          {orderError && <p role="alert" className="text-sm text-red-200">{orderError}</p>}
          {requestNotice && <p role="status" className="text-sm text-emerald-200">{requestNotice}</p>}
          {paidOrder && <p role="status" className="text-sm text-emerald-200">Payment confirmed for {paidOrder.productName}.</p>}
          {order && <PayPalCheckout key={order._id} order={order} onPaid={setPaidOrder} onCancelOrder={handleCancelOrder} />}
        </section>
      )}
    </section>
  );
}
