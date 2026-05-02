import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { http } from "../../lib/http";
import { getErrorMessage } from "../../lib/error";
import type { Product } from "../../types/api";

type CartItem = {
  product_id: number;
  name: string;
  sku: string;
  stock_qty: number;
  qty: number;
};

export default function CreateOrderForm({
  onCreated,
}: {
  onCreated: (id: number) => void;
}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [reference, setReference] = useState("");
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [creating, setCreating] = useState(false);

  async function fetchProducts() {
    try {
      setLoadingProducts(true);
      const response = await http.get<Product[]>("/orders/products");
      setProducts(response.data);
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, "Failed to load products."));
    } finally {
      setLoadingProducts(false);
    }
  }

  useEffect(() => {
    fetchProducts();
  }, []);

  function addToCart(product: Product) {
    if (product.stock_qty <= 0) {
      toast.error("Product is out of stock.");
      return;
    }

    setCart((prev) => {
      const existing = prev.find((item) => item.product_id === product.id);

      if (existing) {
        if (existing.qty >= product.stock_qty) {
          toast.error("Quantity cannot exceed available stock.");
          return prev;
        }

        return prev.map((item) =>
          item.product_id === product.id
            ? { ...item, qty: item.qty + 1 }
            : item
        );
      }

      return [
        ...prev,
        {
          product_id: product.id,
          name: product.name,
          sku: product.sku,
          stock_qty: product.stock_qty,
          qty: 1,
        },
      ];
    });
  }

  function updateQty(productId: number, qty: number) {
    setCart((prev) =>
      prev.map((item) => {
        if (item.product_id !== productId) return item;

        const safeQty = Math.max(1, Math.min(qty, item.stock_qty));
        return { ...item, qty: safeQty };
      })
    );
  }

  function removeFromCart(productId: number) {
    setCart((prev) => prev.filter((item) => item.product_id !== productId));
  }

  async function createOrder() {
    if (!cart.length) {
      toast.error("Add at least one product to the order.");
      return;
    }

    try {
      setCreating(true);

      const payload = {
        customer_id: 1,
        reference: reference.trim() || null,
        items: cart.map((item) => ({
          product_id: item.product_id,
          qty: item.qty,
        })),
      };

      const response = await http.post("/orders", payload);

      toast.success(`Order #${response.data.id} created.`);
      setCart([]);
      setReference("");
      onCreated(response.data.id);
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, "Failed to create order."));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-white">Product catalog</h3>
        <p className="mt-1 text-sm text-slate-400">
          Select products and quantities before creating the order.
        </p>
      </div>

      {loadingProducts ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-6 text-sm text-slate-400">
          Loading products...
        </div>
      ) : products.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/40 p-6 text-sm text-slate-400">
          No products available.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {products.map((product) => (
            <div
              key={product.id}
              className="rounded-3xl border border-slate-800 bg-slate-950/50 p-4 transition hover:border-cyan-400/60"
            >
              <div className="mb-4 flex h-32 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/70">
                <span className="text-sm font-semibold text-cyan-300">
                  {product.sku}
                </span>
              </div>

              <div className="space-y-2">
                <h4 className="text-lg font-bold text-white">
                  {product.name}
                </h4>

                <p className="text-sm text-slate-400">
                  Product ID:{" "}
                  <span className="text-slate-200">{product.id}</span>
                </p>

                <p className="text-sm text-slate-400">
                  Stock:{" "}
                  <span className="text-slate-200">{product.stock_qty}</span>
                </p>
              </div>

              <button
                type="button"
                onClick={() => addToCart(product)}
                disabled={product.stock_qty <= 0}
                className="mt-4 w-full rounded-2xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Add to order
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-3xl border border-slate-800 bg-slate-950/40 p-5">
        <h3 className="text-lg font-semibold text-white">Order items</h3>

        {cart.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">
            No products added yet.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {cart.map((item) => (
              <div
                key={item.product_id}
                className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 md:grid-cols-[1fr_auto_auto]"
              >
                <div>
                  <p className="font-semibold text-white">{item.name}</p>
                  <p className="mt-1 text-sm text-slate-400">
                    SKU: {item.sku} · Stock: {item.stock_qty}
                  </p>
                </div>

                <input
                  type="number"
                  min={1}
                  max={item.stock_qty}
                  value={item.qty}
                  onChange={(e) =>
                    updateQty(item.product_id, Number(e.target.value))
                  }
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-2 text-white outline-none focus:border-cyan-400 md:w-24"
                />

                <button
                  type="button"
                  onClick={() => removeFromCart(item.product_id)}
                  className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-300 transition hover:bg-rose-500/20"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <input
        value={reference}
        onChange={(e) => setReference(e.target.value)}
        placeholder="Reference (optional)"
        className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/40"
      />

      <button
        type="button"
        onClick={createOrder}
        disabled={creating || cart.length === 0}
        className="w-full rounded-2xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {creating ? "Creating order..." : "Create order"}
      </button>
    </div>
  );
}