import { useState } from "react";
import { api } from "../../lib/api";

type Item = {
  product_id: number;
  qty: number;
};

export default function CreateOrderForm({ onCreated }: { onCreated: (id: number) => void }) {
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
      alert("Failed to create order");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h2>Create order</h2>

      <div className="form-group">
        <label>Customer ID</label>
        <input
          type="number"
          value={customerId}
          onChange={(e) => setCustomerId(Number(e.target.value))}
        />
      </div>

      <div className="form-group">
        <label>Reference</label>
        <input
          type="text"
          placeholder="e.g. NL-ORDER-001"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
        />
      </div>

      <div className="items">
        <h3>Items</h3>

        {items.map((item, index) => (
          <div key={index} className="item-row">
            <input
              type="number"
              value={item.product_id}
              onChange={(e) =>
                updateItem(index, "product_id", Number(e.target.value))
              }
              placeholder="Product ID"
            />

            <input
              type="number"
              value={item.qty}
              onChange={(e) =>
                updateItem(index, "qty", Number(e.target.value))
              }
              placeholder="Qty"
            />

            <button onClick={() => removeItem(index)}>✕</button>
          </div>
        ))}

        <button onClick={addItem}>+ Add item</button>
      </div>

      <button onClick={handleSubmit} disabled={loading}>
        {loading ? "Creating..." : "Create order"}
      </button>
    </div>
  );
}