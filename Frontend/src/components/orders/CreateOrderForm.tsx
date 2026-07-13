import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { http } from "../../lib/http";
import { getErrorMessage } from "../../lib/error";
import type { Product } from "../../types/api";
import { useSSE } from "../../hooks/useSSE";

type CartItem = {
  product_id: number;
  name: string;
  sku: string;
  stock_qty: number;
  qty: number;
};

type CreateOrderFormProps = {
  onCreated: (id: number) => void;
  refreshKey?: number;
};

const PRODUCTS_PAGE_SIZE = 8;

function getPaginationItems(current: number, total: number) {
  if (total <= 6) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }

  const items: (number | string)[] = [1, 2];

  if (current > 4) items.push("...");
  if (current > 3 && current < total - 2) items.push(current);
  if (current < total - 3) items.push("...");

  items.push(total - 1, total);

  return [...new Set(items)];
}

export default function CreateOrderForm({
  onCreated,
  refreshKey = 0,
}: CreateOrderFormProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedQtyByProduct, setSelectedQtyByProduct] = useState<
    Record<number, number>
  >({});
  const [reference, setReference] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [productsPage, setProductsPage] = useState(1);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [creating, setCreating] = useState(false);

  const minusButtonClass =
    "flex h-9 w-9 items-center justify-center rounded-xl border border-rose-400/70 bg-rose-500/20 text-lg font-bold text-rose-200 shadow-sm shadow-rose-950/30 transition hover:bg-rose-500/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-40";

  const plusButtonClass =
    "flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-400/70 bg-emerald-500/20 text-lg font-bold text-emerald-200 shadow-sm shadow-emerald-950/30 transition hover:bg-emerald-500/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-40";

  const qtyInputClass =
    "[appearance:textfield] w-16 bg-transparent text-center text-sm font-bold text-white outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

  const filteredProducts = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    if (!query) return products;

    return products.filter((product) => {
      const isNumericSearch = /^\d+$/.test(query);

      if (isNumericSearch) {
        return String(product.id) === query;
      }

      return (
        product.name.toLowerCase().includes(query) ||
        product.sku.toLowerCase().includes(query)
      );
    });
  }, [products, searchTerm]);

  const totalProductPages = Math.max(
    1,
    Math.ceil(filteredProducts.length / PRODUCTS_PAGE_SIZE)
  );

  const paginatedProducts = filteredProducts.slice(
    (productsPage - 1) * PRODUCTS_PAGE_SIZE,
    productsPage * PRODUCTS_PAGE_SIZE
  );

  useEffect(() => {
    if (productsPage > totalProductPages) {
      setProductsPage(totalProductPages);
    }
  }, [productsPage, totalProductPages]);

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

      setCart((prev) =>
        prev
          .map((item) => {
            const freshProduct = response.data.find(
              (product) => product.id === item.product_id
            );

            if (!freshProduct) return null;

            return {
              ...item,
              name: freshProduct.name,
              sku: freshProduct.sku,
              stock_qty: freshProduct.stock_qty,
              qty: Math.min(item.qty, Math.max(freshProduct.stock_qty, 1)),
            };
          })
          .filter((item): item is CartItem => Boolean(item))
      );
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, "Failed to load products."), {
        id: "products-load-error",
      });
    } finally {
      setLoadingProducts(false);
    }
  }

  useEffect(() => {
    fetchProducts();
  }, [refreshKey]);

  useSSE((event) => {
    if (event.type === "inventory_update" || event.type === "product_created") {
      fetchProducts();
    }
  });


  function clampQty(qty: number, max: number) {
    if (!Number.isFinite(qty)) return 1;
    return Math.max(1, Math.min(qty, max));
  }

  function getSelectedQty(product: Product) {
    return selectedQtyByProduct[product.id] ?? 1;
  }

  function changeSelectedQty(product: Product, nextQty: number) {
    setSelectedQtyByProduct((prev) => ({
      ...prev,
      [product.id]: clampQty(nextQty, product.stock_qty),
    }));
  }

  function getStockBadge(product: Product) {
    if (product.stock_qty <= 0) {
      return "border-rose-500/30 bg-rose-500/10 text-rose-300";
    }

    if (product.stock_qty <= 10) {
      return "border-orange-500/30 bg-orange-500/10 text-orange-300";
    }

    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  }

  function getStockLabel(product: Product) {
    if (product.stock_qty <= 0) return "Out of stock";
    if (product.stock_qty <= 10) return "Low stock";
    return "In stock";
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
      prev.map((item) =>
        item.product_id === productId
          ? { ...item, qty: clampQty(nextQty, item.stock_qty) }
          : item
      )
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

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-white">Product catalog</h3>
        <p className="mt-1 text-sm text-slate-400">
          Search products, select quantities, and add them to the order.
        </p>
      </div>

      <input
        value={searchTerm}
        onChange={(e) => {
          setSearchTerm(e.target.value);
          setProductsPage(1);
        }}
        placeholder="Search by product name, SKU, or ID"
        className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/40"
      />

      {loadingProducts ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-6 text-sm text-slate-400">
          Loading products...
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/40 p-6 text-sm text-slate-400">
          No products match your search.
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {paginatedProducts.map((product) => {
            const selectedQty = getSelectedQty(product);
            const isOutOfStock = product.stock_qty <= 0;

            return (
              <div
                key={product.id}
                className="rounded-3xl border border-slate-800 bg-slate-950/50 p-4 transition hover:border-cyan-400/60"
              >
                <div className="mb-4 flex h-32 items-center justify-center rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950">
                  <div className="text-center">
                    <p className="text-2xl font-black text-cyan-300">
                      {product.name.slice(0, 2).toUpperCase()}
                    </p>
                    <p className="mt-2 text-xs font-semibold text-slate-500">
                      {product.sku}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <h4 className="text-lg font-bold text-white">
                      {product.name}
                    </h4>

                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${getStockBadge(
                        product
                      )}`}
                    >
                      {getStockLabel(product)}
                    </span>
                  </div>

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

          {filteredProducts.length > PRODUCTS_PAGE_SIZE && (
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                disabled={productsPage === 1}
                onClick={() => setProductsPage((prev) => Math.max(1, prev - 1))}
                className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-semibold text-slate-300 transition hover:border-cyan-500/40 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                ←
              </button>

              {getPaginationItems(productsPage, totalProductPages).map(
                (item, index) =>
                  item === "..." ? (
                    <span
                      key={`ellipsis-products-${index}`}
                      className="px-2 text-slate-500"
                    >
                      ...
                    </span>
                  ) : (
                    <button
                      key={`products-${item}`}
                      type="button"
                      onClick={() => setProductsPage(Number(item))}
                      className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                        productsPage === item
                          ? "border-cyan-400 bg-cyan-400/15 text-cyan-300"
                          : "border-slate-700 bg-slate-950 text-slate-400 hover:border-cyan-500/40 hover:text-cyan-200"
                      }`}
                    >
                      {item}
                    </button>
                  )
              )}

              <button
                type="button"
                disabled={productsPage === totalProductPages}
                onClick={() =>
                  setProductsPage((prev) =>
                    Math.min(totalProductPages, prev + 1)
                  )
                }
                className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-semibold text-slate-300 transition hover:border-cyan-500/40 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                →
              </button>
            </div>
          )}
        </>
      )}

      <div className="rounded-3xl border border-slate-800 bg-slate-950/40 p-5">
        <h3 className="text-lg font-semibold text-white">Order items</h3>

        {cart.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">No products added yet.</p>
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