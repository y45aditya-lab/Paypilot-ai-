import { useState } from 'react';
import { PayPalScriptProvider, PayPalButtons } from '@paypal/react-paypal-js';
import { createPaypalOrder, capturePayment, formatMoney, getOrderStatus } from '../services/api.js';

export default function Checkout({ order, onPaid, onCancelOrder }) {
  // 'ready' | 'processing' | 'pending' | 'cancelled' | 'error'
  const [status, setStatus] = useState('ready');
  const [message, setMessage] = useState(null);

  const clientId = import.meta.env.VITE_PAYPAL_CLIENT_ID;

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="font-bold">Checkout</h3>
      <p className="text-sm text-slate-600">
        {order.productName} x {order.seats} seats:{' '}
        <strong>{formatMoney(order.totalCents, order.currency)}</strong>
      </p>
      <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
        PayPal sandbox. Use a sandbox buyer account. No real money moves.
      </p>

      {!clientId ? (
        <p className="text-sm text-red-700">VITE_PAYPAL_CLIENT_ID is not set.</p>
      ) : status === 'processing' ? (
        <p className="text-sm text-slate-600">Confirming your payment. Please don't close this page...</p>
      ) : status === 'pending' ? (
        <div className="space-y-2 rounded-lg border border-amber-300/15 bg-amber-300/6 p-3">
          <p className="text-sm text-amber-100">PayPal is still confirming this payment. Don’t submit another payment.</p>
          <button
            type="button"
            onClick={async () => {
              setStatus('processing');
              try {
                const latest = await getOrderStatus(order._id);
                if (latest.order.status === 'paid') onPaid(latest.order);
                else if (latest.order.status === 'failed') {
                  setStatus('error');
                  setMessage('PayPal could not complete this payment. Contact support if your account was charged.');
                } else {
                  setStatus('pending');
                  setMessage('Payment confirmation is still pending. Check again shortly.');
                }
              } catch (err) {
                setStatus('pending');
                setMessage(err.message);
              }
            }}
            className="rounded-lg border border-amber-200/20 px-3 py-2 text-xs font-semibold text-amber-100"
          >
            Check payment status
          </button>
        </div>
      ) : (
        <PayPalScriptProvider options={{ clientId, currency: order.currency, intent: 'capture' }}>
          <PayPalButtons
            style={{ layout: 'vertical' }}
            // 1) The server creates the PayPal order and returns only its id
            createOrder={async () => {
              setMessage(null);
              const { paypalOrderId } = await createPaypalOrder(order._id);
              return paypalOrderId;
            }}
            // 2) The buyer approved. Ask the SERVER to capture and verify
            onApprove={async (_data, actions) => {
              setStatus('processing');
              try {
                const result = await capturePayment(order._id);
                if (result.pending) {
                  setStatus('pending');
                  setMessage(result.message);
                  return;
                }
                onPaid(result.order);
              } catch (err) {
                setStatus('error');
                setMessage(err.message);
                // Declined card: PayPal lets the buyer pick another method
                if (err.code === 'INSTRUMENT_DECLINED') return actions.restart();
              }
            }}
            onCancel={() => {
              setStatus('cancelled');
              setMessage('Payment cancelled. You have not been charged.');
            }}
            onError={(err) => {
              setStatus('error');
              setMessage(err?.message || 'Something went wrong with PayPal.');
            }}
          />
        </PayPalScriptProvider>
      )}

      {message && (
        <p className={`text-sm ${status === 'error' ? 'text-red-700' : 'text-slate-600'}`}>{message}</p>
      )}
      {!['processing', 'pending'].includes(status) && (
        <button onClick={onCancelOrder} className="text-sm text-slate-600 underline">
          Cancel this order
        </button>
      )}
    </div>
  );
}