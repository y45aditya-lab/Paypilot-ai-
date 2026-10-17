import { formatMoney } from '../services/api.js';

export default function PaymentSuccess({ order, onReset, onViewHistory }) {
  return (
    <div className="space-y-2 rounded-xl border border-emerald-300 bg-emerald-50 p-5 text-sm">
      <p className="text-lg font-bold text-emerald-800">Payment confirmed</p>
      <p>
        {order.productName} x {order.seats} seats, {formatMoney(order.totalCents, order.currency)}
      </p>
      <p className="text-xs text-slate-500">Order {order._id} · Demo transaction (PayPal sandbox)</p>
      <div className="flex flex-wrap gap-2">
        <button onClick={onViewHistory} className="rounded-lg bg-emerald-700 px-3 py-1 text-white">
          View transaction history
        </button>
        <button onClick={onReset} className="rounded-lg border border-emerald-600 px-3 py-1 text-emerald-700">
          New request
        </button>
      </div>
    </div>
  );
}