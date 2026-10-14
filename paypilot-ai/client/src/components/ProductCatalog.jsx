import { useEffect, useState } from "react";
import { getProducts } from "../services/api";
import { createPaymentOrder } from "../services/api";
import PayPalCheckout from "./PayPalCheckout";
function normalizeProducts(responseData) {
  if (Array.isArray(responseData)) {
    return responseData;
  }

  if (Array.isArray(responseData?.products)) {
    return responseData.products;
  }

  return [];
}

export default function ProductCatalog() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [orderLoading, setOrderLoading] = useState(false);
const [orderError, setOrderError] = useState("");
const [orderResult, setOrderResult] = useState(null);

  async function handleCreateOrder(product) {
    try {
      setOrderLoading(true);
      setOrderError("");
      setOrderResult(null);

      const result = await createPaymentOrder(product._id);
      setOrderResult(result);
    } catch (error) {
      console.error("Order creation failed:", error);
      setOrderError(
        error.response?.data?.message || "Could not create payment order."
      );
    } finally {
      setOrderLoading(false);
    }
  }

  useEffect(() => {
    async function loadProducts() {
      try {
        setLoading(true);
        setError("");

        const response = await getProducts();
        const normalizedProducts = normalizeProducts(response);

        setProducts(normalizedProducts);
        setSelectedProduct((current) => {
          if (!current) {
            return null;
          }

          return normalizedProducts.some(
            (product) => product?._id === current?._id
          )
            ? current
            : null;
        });
      } catch (err) {
        console.error("Failed to load products:", err);

        setProducts([]);
        setSelectedProduct(null);
        setError(
          err.response?.data?.message ||
            "Could not load products. Please try again."
        );
      } finally {
        setLoading(false);
      }
    }

    loadProducts();
  }, []);

  if (loading) {
    return (
      <section className="p-6">
        <p className="text-gray-500">Loading products...</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="p-6">
        <p className="text-red-600">{error}</p>

        <button
          onClick={() => window.location.reload()}
          className="mt-3 rounded-lg bg-gray-900 px-4 py-2 text-white"
        >
          Reload page
        </button>
      </section>
    );
  }

  return (
    <section className="mt-8 rounded-2xl border border-white/10 bg-slate-900 p-6 text-slate-100">
      <div className="mb-6">
        <h2 className="text-2xl font-bold">Product Catalog</h2>

        <p className="mt-1 text-slate-400">
          Explore products available through PayPilot AI.
        </p>
      </div>

      {products.length === 0 ? (
        <p className="text-slate-400">
          No products are available right now.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => {
            const safePrice = Number(product?.price ?? 0);

            return (
              <article
                key={product?._id ?? `${product?.name ?? "product"}-${product?.price ?? 0}`}
                className="rounded-xl border border-white/10 bg-slate-950 p-5"
              >
                <h3 className="text-lg font-semibold text-slate-100">
                  {product?.name ?? "Untitled product"}
                </h3>

                <p className="mt-2 min-h-12 text-sm text-slate-400">
                  {product?.description ?? "No description provided."}
                </p>

                <p className="mt-4 text-2xl font-bold text-slate-100">
                  {product?.currency || "USD"} {safePrice.toFixed(2)}
                </p>

                <button
                  onClick={() => setSelectedProduct(product)}
                  className="mt-4 w-full rounded-lg bg-violet-700 px-4 py-3 font-medium text-white hover:bg-violet-600"
                >
                  Select product
                </button>
              </article>
            );
          })}
        </div>
      )}

      {selectedProduct && (
        <div className="mt-6 rounded-lg border border-emerald-500/30 bg-emerald-950/40 p-4">
          <p className="font-medium text-emerald-200">
            Selected: {selectedProduct.name}
          </p>

          <p className="mt-1 text-sm text-emerald-100/80">
            Create a PayPal sandbox order for this product.
          </p>

          <div className="mt-2 flex items-center gap-4">
            <button
              onClick={() => handleCreateOrder(selectedProduct)}
              disabled={orderLoading}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
            >
              {orderLoading ? "Creating order..." : "Create payment order"}
            </button>
            <button
              onClick={() => setSelectedProduct(null)}
              className="text-sm font-medium text-emerald-200 underline"
            >
              Clear selection
            </button>
          </div>
          {orderError && <p className="mt-2 text-sm text-red-600">{orderError}</p>}
          {orderResult && (
            <p className="mt-2 text-sm text-emerald-200">
              Payment order created successfully. Order ID: {orderResult.orderId}
            </p>
          )}
          {selectedProduct && (
  <PayPalCheckout
    key={selectedProduct._id}
    product={selectedProduct}
    onSuccess={(result) => {
      console.log("Verified payment:", result);
    }}
  />
)}
        </div>
      )}
    </section>
  );
}