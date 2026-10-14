import { useEffect, useRef, useState } from "react";
import { loadScript } from "@paypal/paypal-js";
import {
  createPaymentOrder,
  capturePaymentOrder,
} from "../services/api";

export default function PayPalCheckout({
  product,
  onSuccess,
}) {
  const buttonContainerRef = useRef(null);
  const [status, setStatus] = useState("Loading PayPal...");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let buttons;

    async function initializePayPal() {
      try {
        const clientId =
          import.meta.env.VITE_PAYPAL_CLIENT_ID;

        if (!clientId) {
          throw new Error(
            "PayPal Sandbox Client ID is missing."
          );
        }

        const paypal = await loadScript({
          clientId,
          currency: product.currency || "USD",
          intent: "capture",
        });

        if (cancelled) return;

        if (!paypal?.Buttons) {
          throw new Error(
            "PayPal Buttons could not be loaded."
          );
        }

        buttons = paypal.Buttons({
          createOrder: async () => {
            const result = await createPaymentOrder(
              product._id
            );

            if (!result.orderId) {
              throw new Error(
                "Backend did not return a PayPal order ID."
              );
            }

            return result.orderId;
          },

          onApprove: async (data) => {
            setStatus("Verifying payment...");
            setError("");

            try {
              const result = await capturePaymentOrder(
                data.orderID
              );

              if (!result.success) {
                throw new Error(
                  "Payment has not been confirmed."
                );
              }

              setStatus("Payment completed.");

              if (onSuccess) {
                onSuccess(result);
              }
            } catch (err) {
              setStatus("Payment verification required.");
              setError(
                err.response?.data?.message ||
                  err.message ||
                  "Could not verify the payment."
              );
            }
          },

          onCancel: () => {
            setStatus("Checkout cancelled.");
          },

          onError: (err) => {
            console.error("PayPal checkout error:", err);
            setStatus("Checkout failed.");
            setError(
              "PayPal checkout failed. Check the server and browser console."
            );
          },
        });

        if (cancelled) {
          await buttons.close();
          return;
        }

        await buttons.render(buttonContainerRef.current);

        if (!cancelled) {
          setStatus("Ready for checkout.");
        }
      } catch (err) {
        console.error("PayPal initialization error:", err);

        if (!cancelled) {
          setStatus("PayPal unavailable.");
          setError(err.message || "Could not load PayPal.");
        }
      }
    }

    initializePayPal();

    return () => {
      cancelled = true;
      if (buttons) {
        buttons.close().catch(() => {});
      }
    };
  }, [product._id, product.currency, onSuccess]);

  return (
    <section className="mt-5 rounded-xl border p-5">
      <h3 className="text-lg font-semibold">
        Checkout: {product.name}
      </h3>

      <p className="my-2 text-gray-600">
        Price: {product.currency || "USD"}{" "}
        {Number(product.price).toFixed(2)}
      </p>

      <div ref={buttonContainerRef} />

      <p className="mt-3 text-sm text-gray-600">
        {status}
      </p>

      {error && (
        <p className="mt-2 text-sm text-red-600">
          {error}
        </p>
      )}
    </section>
  );
}
