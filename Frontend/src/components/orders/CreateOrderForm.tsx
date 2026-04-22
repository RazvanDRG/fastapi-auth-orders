import { useState } from "react";
import { api } from "../../lib/api";

type Item = {
  product_id: number;
  qty: number;
};

export default function CreateOrderForm({
  onCreated,
}: {
  onCreated: (id: number) => void;
}) {
  const [customerId, setCustomerId] = useState(1);
  const [reference, setReference] = useState("");
  const [items, setItems] = useState<Item[]>([{ product_id: 1, qty: 1 }]);
  const [loading, setLoading] = useState(false);

  function updateItem(index: number, field: keyof Item, value: number) {
    const updated = [...items];
    updated[index][field] = value;
    setItems(updated);
  }

  function addItem() {
    setItems([...items, { product_id: 1, qty: 1 }]);
  }

  function removeItem(index: number) {
    setItems(items.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    if (!reference.trim()) {
      alert("Reference is required.");
      return;
    }

    if (items.length === 0) {
      alert("Add at least one item.");
      return;
    }

    const invalidItem = items.some((item) => item.product_id <= 0 || item.qty <= 0);

    if (invalidItem) {
      alert("Product ID and quantity must be greater than 0.");
      return;
    }

    try {
      setLoading(true);

      const res = await api.post("/orders", {
        customer_id: customerId,
        reference,
        items,
      });

      onCreated(res.data.id);
      setReference("");
      setItems([{ product_id: 1, qty: 1 }]);
    } catch (e) {
      console.error(e);
      alert("Failed to create order.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-950/40 p-6">
      <div className="mb-6">
        <h3 className="text-xl font-semibold text-white">Create order</h3>
        <p className="mt-1 text-sm text-slate-400">
          Fill in the order details below.
        </p>
      </div>

      <div className="space-y-5">
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-200">
            Customer ID
          </label>
          <input
            type="number"
            value={customerId}
            onChange={(e) => setCustomerId(Number(e.target.value))}
            className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-200">
            Reference
          </label>
          <input
            type="text"
            placeholder="e.g. NL-ORDER-001"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400"
          />
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-lg font-semibold text-white">Items</h4>
            <button
              type="button"
              onClick={addItem}
              className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-medium text-slate-100 transition hover:border-cyan-400 hover:text-cyan-300"
            >
              + Add item
            </button>
          </div>

          <div className="space-y-3">
            {items.map((item, index) => (
              <div
                key={index}
                className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-900/40 p-4 md:grid-cols-[1fr_1fr_auto]"
              >
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-300">
                    Product ID
                  </label>
                  <input
                    type="number"
                    value={item.product_id}
                    onChange={(e) =>
                      updateItem(index, "product_id", Number(e.target.value))
                    }
                    className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-300">
                    Quantity
                  </label>
                  <input
                    type="number"
                    value={item.qty}
                    onChange={(e) => updateItem(index, "qty", Number(e.target.value))}
                    className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
                  />
                </div>

                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    className="w-full rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-300 transition hover:bg-rose-500/20 md:w-auto"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading}
          className="rounded-2xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Creating..." : "Create order"}
        </button>
      </div>
    </div>
  );
}