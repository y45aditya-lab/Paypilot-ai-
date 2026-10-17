import { useState } from 'react';
import { requestRecommendation, createPurchaseRequest, cancelOrder, getProducts } from '../services/api.js';
import { PRODUCT_CATEGORIES } from '../services/stackOptimizer.js';
import RecommendationForm from './RecommendationForm.jsx';
import RecommendationResult from './RecommendationResult.jsx';
import Checkout from './PayPalCheckout.jsx';
import PaymentSuccess from './PaymentSuccess.jsx';
import TransactionCopilot from './TransactionCopilot.jsx';

export default function PurchaseAssistant({ onViewHistory }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [approving, setApproving] = useState(false);
  const [order, setOrder] = useState(null);     // server order awaiting payment
  const [paidOrder, setPaidOrder] = useState(null);
  const [alternatives, setAlternatives] = useState([]);
  const [requestNotice, setRequestNotice] = useState('');

  function reset() {
    setResult(null); setError(null); setOrder(null); setPaidOrder(null); setAlternatives([]); setRequestNotice('');
  }

  async function handleSubmit({ message, budgetInr, seats, category, priority }) {
    reset();
    setLoading(true);
    try {
      const categoryLabel = PRODUCT_CATEGORIES.find((item) => item.id === category)?.label;
      const priorityLabel = {
        balanced: 'balanced value',
        'lowest-cost': 'the lowest total cost',
        features: 'the most useful listed features',
      }[priority];
      const prompt = `${message.trim()} Team size: ${seats}; category: ${categoryLabel ?? 'choose the best fit'}; priority: ${priorityLabel}.`;

      const recommendation = await requestRecommendation({ message: prompt, budgetInr, seats, category: category || undefined });
      setResult(recommendation);
      if (recommendation.ok) {
        try {
          const catalog = await getProducts();
          const alternativesForCategory = (catalog.products ?? [])
            .filter((product) => product.active
              && (!category || product.category === category)
              && product._id !== recommendation.quote.product.id
              && seats >= (product.minSeats ?? 1)
              && seats <= (product.maxSeats ?? 10000)
              && product.currency === recommendation.quote.currency)
            .map((product) => ({
              product,
              totalCents: product.pricingModel === 'per_seat'
                ? product.unitPriceCents * seats
                : product.unitPriceCents,
            }))
            .filter((candidate) => candidate.totalCents <= recommendation.quote.budgetCents)
            .sort((a, b) => a.totalCents - b.totalCents)
            .slice(0, 3);
          setAlternatives(alternativesForCategory);
        } catch (catalogError) {
          setError(`Recommendation ready, but alternatives could not be loaded: ${catalogError.message}`);
        }
      }
    } catch (err) {
      setError(err.message || 'Could not complete the recommendation. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  // The selected product still requires organization approval before checkout.
  async function handleApprove(quote) {
    const justification = window.prompt(`Why does your team need ${quote.product.name}? (5-1000 characters)`);
    if (justification === null) return;
    if (justification.trim().length < 5) {
      setError('Please enter a purchase justification of at least 5 characters.');
      return;
    }
    setApproving(true);
    setError(null);
    try {
      const data = await createPurchaseRequest({
        productId: quote.product.id, seats: quote.seats, justification: justification.trim(),
      });
      setRequestNotice(`${data.request.productName} submitted for manager approval. Continue from Requests & approvals.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setApproving(false);
    }
  }

  async function handleCancelOrder() {
    try {
      await cancelOrder(order._id);
      setOrder(null);
    } catch (err) {
      setError(err.message);
    }
  }

  if (paidOrder) return <PaymentSuccess order={paidOrder} onReset={reset} onViewHistory={onViewHistory} />;

  return (
    <div className="space-y-4">
      <TransactionCopilot />
      <RecommendationForm onSubmit={handleSubmit} loading={loading} />
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {requestNotice && <p role="status" className="rounded-lg border border-emerald-300/20 bg-emerald-300/6 p-3 text-sm text-emerald-100">{requestNotice}</p>}
      {result && (
        <RecommendationResult
          result={result}
          alternatives={alternatives}
          onApprove={order || requestNotice ? undefined : handleApprove}
          approving={approving}
        />
      )}
      {order && (
        <Checkout
          order={order}
          onPaid={setPaidOrder}
          onCancelOrder={handleCancelOrder}
        />
      )}
    </div>
  );
}