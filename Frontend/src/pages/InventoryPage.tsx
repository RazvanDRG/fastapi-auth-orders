import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

import { http } from "../lib/http";
import { getErrorMessage } from "../lib/utils";

type Product = {
  id: number;
  sku: string;
  name: string;
  stock_qty: number;
};

type InventoryEvent = {
  id: number;
  user_id: number;
  product_id: number;
  sku: string;
  first_name?: string | null;
  last_name?: string | null;
  old_stock: number;
  new_stock: number;
  delta: number;
  created_at: string;
};

const PRODUCTS_PER_PAGE = 8;

function getStockBadge(stock: number) {
  if (stock <= 0) return "border-rose-500/30 bg-rose-500/10 text-rose-300";
  if (stock <= 10) return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
}

export function InventoryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [stockQty, setStockQty] = useState(0);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editingProductId, setEditingProductId] = useState<number | null>(null);
  const [stockDeltaByProduct, setStockDeltaByProduct] = useState<Record<number, number>>({});
  const [inventoryEvents, setInventoryEvents] = useState<InventoryEvent[]>([]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();

    return [...products]
      .filter(
        (p) =>
          !q ||
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          String(p.id).includes(q)
      )
      .sort((a, b) => a.id - b.id);
  }, [products, search]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PRODUCTS_PER_PAGE));

  const paginatedProducts = filteredProducts.slice(
    (page - 1) * PRODUCTS_PER_PAGE,
    page * PRODUCTS_PER_PAGE
  );

  const healthy = products.filter((p) => p.stock_qty > 10).length;
  const low = products.filter((p) => p.stock_qty > 0 && p.stock_qty <= 10).length;
  const out = products.filter((p) => p.stock_qty <= 0).length;

  async function fetchProducts() {
    try {
      setLoading(true);
      const { data } = await http.get<Product[]>("/products");
      setProducts(data);
    } catch (err: unknown) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchProducts();
    fetchInventoryHistory();
  }, []);

  async function adjustStock(product: Product) {
    const delta = stockDeltaByProduct[product.id] ?? 0;
    const nextStock = product.stock_qty + delta;

    if (delta === 0) {
      toast.error("Adjustment cannot be 0.");
      return;
    }

    if (nextStock < 0) {
      toast.error("Stock cannot go below 0.");
      return;
    }

    await updateStock(product.id, nextStock);

    setEditingProductId(null);
    setStockDeltaByProduct((prev) => ({
      ...prev,
      [product.id]: 0,
    }));
  }

  async function createProduct() {
    if (!sku.trim() || !name.trim()) {
      toast.error("SKU and product name are required.");
      return;
    }

    try {
      setSaving(true);

      await http.post("/products", {
        sku: sku.trim(),
        name: name.trim(),
        stock_qty: stockQty,
      });

      toast.success("Product created.");
      setSku("");
      setName("");
      setStockQty(0);
      await fetchProducts();
      await fetchInventoryHistory();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function updateStock(productId: number, nextStock: number) {
    try {
      await http.patch(`/products/${productId}/stock`, {
        stock_qty: nextStock,
      });

      toast.success("Stock updated.");
      await fetchProducts();
      await fetchInventoryHistory();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err));
    }
  }

  function updateLocalProduct(productId: number, patch: Partial<Product>) {
    setProducts((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, ...patch } : p))
    );
  }

  async function fetchInventoryHistory() {
  try {
    const { data } = await http.get<InventoryEvent[]>("/products/history");
    setInventoryEvents(data ?? []);
  } catch (err: unknown) {
    toast.error(getErrorMessage(err));
  }
}

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-bold tracking-tight text-white">Inventory</h1>
        <p className="mt-2 text-sm text-slate-300">
          Product catalog and warehouse stock management.
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
          <p className="text-sm text-slate-400">Total products</p>
          <p className="mt-2 text-3xl font-bold text-white">{products.length}</p>
        </div>

        <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
          <p className="text-sm text-slate-400">Healthy stock</p>
          <p className="mt-2 text-3xl font-bold text-emerald-300">{healthy}</p>
        </div>

        <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
          <p className="text-sm text-slate-400">Low stock</p>
          <p className="mt-2 text-3xl font-bold text-amber-300">{low}</p>
        </div>

        <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
          <p className="text-sm text-slate-400">Out of stock</p>
          <p className="mt-2 text-3xl font-bold text-rose-300">{out}</p>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl shadow-black/20">
        <h2 className="text-2xl font-semibold text-white">Add new product</h2>
        <p className="mt-1 text-sm text-slate-400">
          Create inventory products available for order workflows.
        </p>

        <div className="mt-6 grid gap-4 xl:grid-cols-[1fr_1.5fr_0.7fr_auto]">
          <input
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            placeholder="SKU-001"
            className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-cyan-400"
          />

          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Product name"
            className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-cyan-400"
          />

          <input
            type="number"
            value={stockQty}
            onChange={(e) => setStockQty(Math.max(0, Number(e.target.value)))}
            className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-cyan-400"
          />

          <button
            type="button"
            disabled={saving}
            onClick={createProduct}
            className="rounded-2xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950 transition hover:brightness-110 disabled:opacity-60"
          >
            {saving ? "Creating..." : "Create product"}
          </button>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl shadow-black/20">
        <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-white">Inventory stock</h2>
            <p className="mt-1 text-sm text-slate-400">
              Showing {paginatedProducts.length} of {filteredProducts.length} products.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search by name, SKU, or ID"
              className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-white outline-none placeholder:text-slate-500 focus:border-cyan-400 sm:w-72"
            />

            <button
              type="button"
              onClick={fetchProducts}
              disabled={loading}
              className="rounded-2xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-100 transition hover:border-cyan-400 hover:text-cyan-300 disabled:opacity-60"
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/40 p-6 text-sm text-slate-400">
            Loading products...
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {paginatedProducts.map((product) => (
              <div
                key={product.id}
                className="rounded-3xl border border-slate-800 bg-slate-950/40 p-5 transition hover:border-cyan-500/30"
              >
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                      Product #{product.id}
                    </p>
                    <h3 className="mt-2 text-xl font-bold text-white">{product.name}</h3>
                    <p className="mt-1 text-sm text-slate-400">SKU: {product.sku}</p>
                  </div>

                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${getStockBadge(
                      product.stock_qty
                    )}`}
                  >
                    {product.stock_qty <= 0
                      ? "Out of stock"
                      : product.stock_qty <= 10
                      ? "Low stock"
                      : "Healthy"}
                  </span>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                        <p className="text-xs uppercase tracking-wide text-slate-500">
                            Current stock
                        </p>

                        <p className="mt-2 text-2xl font-bold text-white">
                            {product.stock_qty}
                        </p>
                        </div>

                        {editingProductId !== product.id ? (
                        <button
                            type="button"
                            onClick={() => {
                            setEditingProductId(product.id);
                            setStockDeltaByProduct((prev) => ({
                                ...prev,
                                [product.id]: prev[product.id] ?? 1,
                            }));
                            }}
                            className="rounded-2xl border border-cyan-500/40 bg-cyan-500/10 px-5 py-3 text-sm font-semibold text-cyan-300 transition hover:bg-cyan-500/20"
                        >
                            Modify stock
                        </button>
                        ) : (
                        <div className="flex flex-col gap-3 sm:items-end">
                            <p className="text-xs uppercase tracking-wide text-slate-500">
                            Quantity to add
                            </p>

                            <div className="flex items-center gap-2 rounded-2xl border border-slate-800 bg-slate-950 p-2">
                            <button
                                type="button"
                                onClick={() =>
                                setStockDeltaByProduct((prev) => ({
                                    ...prev,
                                    [product.id]: (prev[product.id] ?? 0) - 1,
                                }))
                                }
                                className="flex h-9 w-9 items-center justify-center rounded-xl border border-rose-400/70 bg-rose-500/20 text-lg font-bold text-rose-200 transition hover:bg-rose-500/30 hover:text-white"
                            >
                                -
                            </button>

                            <input
                                type="number"
                                value={stockDeltaByProduct[product.id] ?? 0}
                                onChange={(e) =>
                                setStockDeltaByProduct((prev) => ({
                                    ...prev,
                                    [product.id]: (prev[product.id] ?? 0) - 1,
                                }))
                                }
                                className="[appearance:textfield] w-20 bg-transparent text-center text-sm font-bold text-white outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            />

                            <button
                                type="button"
                                onClick={() =>
                                setStockDeltaByProduct((prev) => ({
                                    ...prev,
                                    [product.id]: (prev[product.id] ?? 0) + 1,
                                }))
                                }
                                className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-400/70 bg-emerald-500/20 text-lg font-bold text-emerald-200 transition hover:bg-emerald-500/30 hover:text-white"
                            >
                                +
                            </button>
                            </div>

                            <p className="text-xs text-slate-400">
                            Resulting stock:{" "}
                            <span className="font-semibold text-white">
                                {product.stock_qty + (stockDeltaByProduct[product.id] ?? 0)}
                            </span>
                            </p>

                            <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => adjustStock(product)}
                              disabled={
                                product.stock_qty +
                                  (stockDeltaByProduct[product.id] ?? 0) <
                                0
                              }
                              className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-5 py-3 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                Save
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                setEditingProductId(null);
                                setStockDeltaByProduct((prev) => ({
                                    ...prev,
                                    [product.id]: 0,
                                }));
                                }}
                                className="rounded-2xl border border-slate-700 bg-slate-900 px-5 py-3 text-sm font-semibold text-slate-300 transition hover:border-slate-500 hover:text-white"
                            >
                                Cancel
                            </button>
                            </div>
                        </div>
                        )}
                    </div>
                  </div>
              </div>
            ))}
          </div>
        )}

        {filteredProducts.length > PRODUCTS_PER_PAGE && (
          <div className="mt-6 flex justify-center gap-2">
            <button
              disabled={page === 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-semibold text-slate-300 disabled:opacity-40"
            >
              ←
            </button>

            <span className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm text-slate-300">
              {page} / {totalPages}
            </span>

            <button
              disabled={page === totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-semibold text-slate-300 disabled:opacity-40"
            >
              →
            </button>
          </div>
        )}
      </section>
      <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl shadow-black/20">
        <div className="mb-5">
          <h2 className="text-2xl font-semibold text-white">Inventory history</h2>
          <p className="mt-1 text-sm text-slate-400">
            Recent stock adjustments performed by admin and service users.
          </p>
        </div>

        {inventoryEvents.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/40 p-6 text-sm text-slate-400">
            No inventory history yet.
          </div>
        ) : (
          <div className="space-y-3">
            {inventoryEvents.slice(0, 10).map((event) => {
              const actorName =
                [event.first_name, event.last_name].filter(Boolean).join(" ") ||
                "Unknown user";

              return (
                <div
                  key={event.id}
                  className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-semibold text-white">{actorName}</p>
                      <p className="mt-1 text-sm text-slate-400">
                        User ID #{event.user_id} adjusted SKU{" "}
                        <span className="font-semibold text-cyan-300">{event.sku}</span>
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                          event.delta >= 0
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                            : "border-rose-500/30 bg-rose-500/10 text-rose-300"
                        }`}
                      >
                        {event.delta >= 0 ? `+${event.delta}` : event.delta}
                      </span>

                      <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-semibold text-slate-300">
                        {event.old_stock} → {event.new_stock}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}