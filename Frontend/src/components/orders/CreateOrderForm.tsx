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
  const [selectedQtyByProduct, setSelectedQtyByProduct] = useState<
    Record<number, number>
  >({});
  const [reference, setReference] = useState("");
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [creating, setCreating] = useState(false);

  async function fetchProducts() {
    try {
      setLoadingProducts(true);

      const response = await http.get<Product[]>("/orders/products");
      setProducts(response.data);

      const initialQty = response.data.reduce<Record<number, number>>(
        (acc, product) => {
          acc[product.id] = 1;
          return acc;
        },
        {}
      );

      setSelectedQtyByProduct(initialQty);
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, "Failed to load products."));
    } finally {
      setLoadingProducts(false);
    }
  }

  useEffect(() => {
    fetchProducts();
  }, []);

  function clampQty(qty: number, max: number) {
    if (!Number.isFinite(qty)) return 1;
    return Math.max(1, Math.min(qty, max));
  }

  function getSelectedQty(product: Product) {
    return selectedQtyByProduct[product.id] ?? 1;
  }

  function changeSelectedQty(product: Product, nextQty: number) {
    const safeQty = clampQty(nextQty, product.stock_qty);

    setSelectedQtyByProduct((prev) => ({
      ...prev,
      [product.id]: safeQty,
    }));
  }

  function addToCart(product: Product) {
    if (product.stock_qty <= 0) {
      toast.error("Product is out of stock.");
      return;
    }

    const selectedQty = getSelectedQty(product);

    setCart((prev) => {
      const existing = prev.find((item) => item.product_id === product.id);

      if (existing) {
        const nextQty = existing.qty + selectedQty;

        if (nextQty > product.stock_qty) {
          toast.error("Quantity cannot exceed available stock.");
          return prev;
        }

        return prev.map((item) =>
          item.product_id === product.id ? { ...item, qty: nextQty } : item
        );
      }

      return [
        ...prev,
        {
          product_id: product.id,
          name: product.name,
          sku: product.sku,
          stock_qty: product.stock_qty,
          qty: selectedQty,
        },
      ];
    });
  }

  function changeCartQty(productId: number, nextQty: number) {
    setCart((prev) =>
      prev.map((item) => {
        if (item.product_id !== productId) return item;

        return {
          ...item,
          qty: clampQty(nextQty, item.stock_qty),
        };
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

  const minusButtonClass =
    "flex h-9 w-9 items-center justify-center rounded-xl border border-rose-400/70 bg-rose-500/20 text-lg font-bold text-rose-200 shadow-sm shadow-rose-950/30 transition hover:bg-rose-500/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-40";

  const plusButtonClass =
    "flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-400/70 bg-emerald-500/20 text-lg font-bold text-emerald-200 shadow-sm shadow-emerald-950/30 transition hover:bg-emerald-500/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-40";

  const qtyInputClass =
    "[appearance:textfield] w-16 bg-transparent text-center text-sm font-bold text-white outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

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
          {products.map((product) => {
            const selectedQty = getSelectedQty(product);
            const isOutOfStock = product.stock_qty <= 0;

            return (
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
                    <span
                      className={
                        isOutOfStock ? "text-rose-300" : "text-slate-200"
                      }
                    >
                      {product.stock_qty}
                    </span>
                  </p>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-2">
                  <button
                    type="button"
                    onClick={() => changeSelectedQty(product, selectedQty - 1)}
                    disabled={isOutOfStock || selectedQty <= 1}
                    className={minusButtonClass}
                  >
                    -
                  </button>

                  <input
                    type="number"
                    min={1}
                    max={product.stock_qty}
                    value={selectedQty}
                    onChange={(e) =>
                      changeSelectedQty(product, Number(e.target.value))
                    }
                    disabled={isOutOfStock}
                    className={qtyInputClass}
                  />

                  <button
                    type="button"
                    onClick={() => changeSelectedQty(product, selectedQty + 1)}
                    disabled={isOutOfStock || selectedQty >= product.stock_qty}
                    className={plusButtonClass}
                  >
                    +
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => addToCart(product)}
                  disabled={isOutOfStock}
                  className="mt-3 w-full rounded-2xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isOutOfStock
                    ? "Out of stock"
                    : `Add ${selectedQty} to order`}
                </button>
              </div>
            );
          })}
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

                <div className="flex items-center gap-2 rounded-2xl border border-slate-800 bg-slate-950 p-2">
                  <button
                    type="button"
                    onClick={() => changeCartQty(item.product_id, item.qty - 1)}
                    disabled={item.qty <= 1}
                    className={minusButtonClass}
                  >
                    -
                  </button>

                  <input
                    type="number"
                    min={1}
                    max={item.stock_qty}
                    value={item.qty}
                    onChange={(e) =>
                      changeCartQty(item.product_id, Number(e.target.value))
                    }
                    className={qtyInputClass}
                  />

                  <button
                    type="button"
                    onClick={() => changeCartQty(item.product_id, item.qty + 1)}
                    disabled={item.qty >= item.stock_qty}
                    className={plusButtonClass}
                  >
                    +
                  </button>
                </div>

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