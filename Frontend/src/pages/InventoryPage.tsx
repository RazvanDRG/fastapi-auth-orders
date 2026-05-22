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
  event_type?: string | null;
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
  const [historyPage, setHistoryPage] = useState(1);
  const [historySearch, setHistorySearch] = useState("");
  const [historyStartDate, setHistoryStartDate] = useState("");
  const [historyEndDate, setHistoryEndDate] = useState("");

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

const filteredInventoryEvents = inventoryEvents.filter((event) => {
  const query = historySearch.trim().toLowerCase();
  const eventTime = new Date(event.created_at).getTime();

  const startTime = historyStartDate
    ? new Date(historyStartDate).getTime()
    : null;

  const endTime = historyEndDate
    ? new Date(historyEndDate).getTime()
    : null;

  const actorName = [event.first_name, event.last_name]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const matchesSearch =
    !query ||
    actorName.includes(query) ||
    event.sku.toLowerCase().includes(query) ||
    String(event.user_id).includes(query) ||
    String(event.product_id).includes(query);

  const matchesStart = startTime === null || eventTime >= startTime;
  const matchesEnd = endTime === null || eventTime <= endTime;

  return matchesSearch && matchesStart && matchesEnd;
});

  async function fetchInventoryHistory() {
  try {
    const { data } = await http.get<InventoryEvent[]>("/products/history");
    setInventoryEvents(data ?? []);
  } catch (err: unknown) {
    toast.error(getErrorMessage(err));
  }
}

function exportInventoryHistoryCsv() {
  const headers = [
    "event_id",
    "user_id",
    "user_name",
    "product_id",
    "sku",
    "delta",
    "old_stock",
    "new_stock",
    "created_at",
  ];

  const escapeCsv = (value: string | number | null | undefined) => {
    const text = String(value ?? "");
    return `"${text.replace(/:/g, "-")}"`;
  };

  const rows = filteredInventoryEvents.map((event) => {
    const actorName =
      [event.first_name, event.last_name].filter(Boolean).join(" ") ||
      "Unknown user";

    return [
      event.id,
      event.user_id,
      actorName,
      event.product_id,
      event.sku,
      event.delta,
      event.old_stock,
      event.new_stock,
      new Date(event.created_at).toLocaleString(),
    ].map(escapeCsv);
  });

  const csv = [headers.map(escapeCsv), ...rows]
    .map((row) => row.join(","))
    .join("\n");

  const blob = new Blob([csv], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `inventory-history-${new Date()
    .toISOString()
    .slice(0, 19)
    .replace(/:/g, "-")}.csv`;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
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
        <div className="mb-6 flex flex-col gap-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-white">
                Inventory history
              </h2>

              <p className="mt-1 max-w-2xl text-sm text-slate-400">
                Stock adjustments performed by admin and service users.
              </p>
            </div>

            <span className="flex h-fit items-center rounded-full border border-slate-700 bg-slate-950 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-300">
              {filteredInventoryEvents.length} events
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <input
              value={historySearch}
              onChange={(e) => {
                setHistorySearch(e.target.value);
                setHistoryPage(1);
              }}
              placeholder="Search by SKU, user name, user ID, product ID"
              className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400 xl:w-96"
            />

            <div className="relative">
              <input
                type="datetime-local"
                value={historyStartDate}
                onChange={(e) => {
                  setHistoryStartDate(e.target.value);
                  setHistoryPage(1);
                }}
                onClick={(e) => e.currentTarget.showPicker?.()}
                className="w-full cursor-pointer rounded-2xl border border-slate-700 bg-slate-950 px-4 py-2.5 pr-12 text-sm text-white outline-none transition focus:border-cyan-400 xl:w-60 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0"
              />

              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.8}
                stroke="currentColor"
                className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-cyan-300"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8.25 3v1.5M15.75 3v1.5M3.75 8.25h16.5M4.5 5.25h15a.75.75 0 01.75.75v12a.75.75 0 01-.75.75h-15A.75.75 0 013.75 18V6a.75.75 0 01.75-.75z"
                />
              </svg>
            </div>

            <div className="relative">
              <input
                type="datetime-local"
                value={historyEndDate}
                onChange={(e) => {
                  setHistoryEndDate(e.target.value);
                  setHistoryPage(1);
                }}
                onClick={(e) => e.currentTarget.showPicker?.()}
                className="w-full cursor-pointer rounded-2xl border border-slate-700 bg-slate-950 px-4 py-2.5 pr-12 text-sm text-white outline-none transition focus:border-cyan-400 xl:w-60 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0"
              />

              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.8}
                stroke="currentColor"
                className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-cyan-300"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8.25 3v1.5M15.75 3v1.5M3.75 8.25h16.5M4.5 5.25h15a.75.75 0 01.75.75v12a.75.75 0 01-.75.75h-15A.75.75 0 013.75 18V6a.75.75 0 01.75-.75z"
                />
              </svg>
            </div>
            <button
              type="button"
              onClick={exportInventoryHistoryCsv}
              disabled={filteredInventoryEvents.length === 0}
              className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              CSV report
            </button>

            <button
              type="button"
              onClick={async () => {
                await fetchInventoryHistory();
                setHistoryPage(1);
              }}
              className="rounded-2xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-100 transition hover:border-cyan-400 hover:text-cyan-300"
            >
              Refresh
            </button>

            <button
              type="button"
              onClick={() => {
                setHistorySearch("");
                setHistoryStartDate("");
                setHistoryEndDate("");
                setHistoryPage(1);
              }}
              className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:border-rose-500/40 hover:text-rose-300"
            >
              Clear
            </button>
          </div>
        </div>

        {filteredInventoryEvents.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/40 p-6 text-sm text-slate-400">
            No inventory history yet.
          </div>
        ) : (
          <>
            <div className="overflow-hidden rounded-2xl border border-slate-800">
              <div className="grid grid-cols-[1.2fr_1fr_1fr_0.7fr_0.8fr] gap-4 border-b border-slate-800 bg-slate-950/70 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <div>User</div>
                <div>SKU</div>
                <div>Date</div>
                <div>Delta</div>
                <div>Stock</div>
              </div>

              <div className="divide-y divide-slate-800">
                {filteredInventoryEvents
                  .slice((historyPage - 1) * 10, historyPage * 10)
                  .map((event) => {
                    const actorName =
                      [event.first_name, event.last_name].filter(Boolean).join(" ") ||
                      "Unknown user";

                    const isIncrease = event.delta >= 0;
                    const isNewProduct = event.event_type === "product_created";

                    return (
                      <div
                        key={event.id}
                        className="grid grid-cols-[1.2fr_1fr_1fr_0.7fr_0.8fr] gap-4 bg-slate-950/40 px-5 py-4 text-sm transition hover:bg-slate-900/60"
                      >
                        <div>
                          <p className="font-semibold text-white">{actorName}</p>

                          <p className="mt-1 text-xs text-slate-500">
                            User ID #{event.user_id}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-300">
                            {event.sku}
                          </span>
                          {isNewProduct && (
                            <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-300">
                              New
                            </span>
                          )}
                        </div>

                        <div className="flex items-center text-slate-400">
                          {new Date(event.created_at).toLocaleString()}
                        </div>

                        <div className="flex items-center">
                          <span
                            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                              isNewProduct
                                ? "border-violet-500/30 bg-violet-500/10 text-violet-300"
                                : isIncrease
                                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                                : "border-rose-500/30 bg-rose-500/10 text-rose-300"
                            }`}
                          >
                            {isIncrease ? `+${event.delta}` : event.delta}
                          </span>
                        </div>

                        <div className="flex items-center">
                          <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-semibold text-slate-300">
                            {event.old_stock} → {event.new_stock}
                          </span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            {filteredInventoryEvents.length > 10 && (
              <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  disabled={historyPage === 1}
                  onClick={() => setHistoryPage((prev) => Math.max(1, prev - 1))}
                  className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-semibold text-slate-300 transition hover:border-cyan-500/40 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ←
                </button>

                {Array.from(
                  { length: Math.ceil(filteredInventoryEvents.length / 10)
                   },
                  (_, index) => index + 1
                ).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setHistoryPage(item)}
                    className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                      historyPage === item
                        ? "border-cyan-400 bg-cyan-400/15 text-cyan-300"
                        : "border-slate-700 bg-slate-950 text-slate-400 hover:border-cyan-500/40 hover:text-cyan-200"
                    }`}
                  >
                    {item}
                  </button>
                ))}

                <button
                  type="button"
                  disabled={historyPage === Math.ceil(filteredInventoryEvents.length / 10)}
                  onClick={() =>
                    setHistoryPage((prev) =>
                      Math.min(Math.ceil(filteredInventoryEvents.length / 10), prev + 1)
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
      </section>
    </div>
  );
}