import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import CreateOrderForm from "../components/orders/CreateOrderForm";
import { api } from "../lib/api";
import { getErrorMessage } from "../lib/error";

type OrderStatus =
  | "created"
  | "reserved"
  | "picking"
  | "picked"
  | "shipped"
  | "cancelled"
  | string;

type OrderItem = {
  product_id: number;
  qty: number;
};

type Order = {
  id: number;
  customer_id: number;
  reference: string;
  status: OrderStatus;
  items?: OrderItem[];
};

const statusToneMap: Record<string, string> = {
  created: "bg-slate-700/70 text-slate-100 border border-slate-600",
  reserved: "bg-amber-500/15 text-amber-300 border border-amber-500/30",
  picking: "bg-sky-500/15 text-sky-300 border border-sky-500/30",
  picked: "bg-violet-500/15 text-violet-300 border border-violet-500/30",
  shipped: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30",
  cancelled: "bg-rose-500/15 text-rose-300 border border-rose-500/30",
};

const workflowSteps = ["created", "reserved", "picking", "picked", "shipped"];

function getStatusClasses(status?: string) {
  return (
    statusToneMap[(status || "").toLowerCase()] ||
    "bg-slate-700/70 text-slate-100 border border-slate-600"
  );
}

function prettyStatus(status?: string) {
  if (!status) return "-";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export default function OrdersPage() {
  const [orderIdInput, setOrderIdInput] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [loadingOrder, setLoadingOrder] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [formError, setFormError] = useState("");

  const currentStepIndex = useMemo(() => {
    if (!selectedOrder?.status) return -1;
    return workflowSteps.indexOf(selectedOrder.status.toLowerCase());
  }, [selectedOrder?.status]);

  async function fetchOrderById(id?: number, options?: { silent?: boolean }) {
    const parsedId = id ?? Number(orderIdInput);

    setFormError("");

    if (!parsedId || Number.isNaN(parsedId) || parsedId <= 0) {
      setFormError("Enter a valid order ID.");
      return;
    }

    try {
      setLoadingOrder(true);

      const response = await api.get(`/orders/${parsedId}`);
      setSelectedOrder(response.data);
      setOrderIdInput(String(parsedId));

      if (!options?.silent) {
        toast.success(`Order ${parsedId} loaded.`);
      }
    } catch (err: unknown) {
      setSelectedOrder(null);
      toast.error(
        getErrorMessage(
          err,
          "Failed to load order. Check the ID and try again."
        )
      );
    } finally {
      setLoadingOrder(false);
    }
  }

  async function runOrderAction(action: string) {
    if (!selectedOrder?.id) {
      setFormError("Load an order first.");
      return;
    }

    try {
      setActionLoading(action);
      setFormError("");

      await api.post(`/orders/${selectedOrder.id}/${action}`);
      await fetchOrderById(selectedOrder.id, { silent: true });

      toast.success(`Action "${action}" completed for order ${selectedOrder.id}.`);
    } catch (err: unknown) {
      toast.error(
        getErrorMessage(
          err,
          `Failed to run "${action}" for order ${selectedOrder.id}.`
        )
      );
    } finally {
      setActionLoading(null);
    }
  }

  const actions = [
    { key: "reserve", label: "Reserve" },
    { key: "retry-reserve", label: "Retry reserve" },
    { key: "start-pick", label: "Start pick" },
    { key: "confirm-pick", label: "Confirm pick" },
    { key: "ship", label: "Ship" },
    { key: "cancel", label: "Cancel", danger: true },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-bold tracking-tight text-white">
          Orders workflow
        </h1>
        <p className="mt-2 text-sm text-slate-300">
          Create an order, load it by ID, then drive the warehouse lifecycle.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <section
          id="create-order"
          className="scroll-mt-6 rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl shadow-black/20"
        >
          <div className="mb-5">
            <h2 className="text-2xl font-semibold text-white">Create order</h2>
            <p className="mt-1 text-sm text-slate-400">
              Use a proper form instead of raw JSON.
            </p>
          </div>

          <CreateOrderForm
            onCreated={(id) => {
              setOrderIdInput(String(id));
              fetchOrderById(id, { silent: true });
            }}
          />
        </section>

        <section
          id="load-order"
          className="scroll-mt-6 rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl shadow-black/20"
        >
          <div className="mb-5">
            <h2 className="text-2xl font-semibold text-white">
              Load and operate
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Because the backend has no list endpoint, lookup is by order ID.
            </p>
          </div>

          <div className="flex flex-col gap-3 md:flex-row">
            <div className="flex-1">
              <label className="mb-2 block text-sm font-medium text-slate-200">
                Order ID
              </label>
              <input
                type="number"
                min={1}
                value={orderIdInput}
                onChange={(e) => {
                  setOrderIdInput(e.target.value);
                  setFormError("");
                }}
                placeholder="e.g. 16"
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/40"
              />
            </div>

            <div className="md:self-end">
              <button
                onClick={() => fetchOrderById()}
                disabled={loadingOrder}
                className="w-full rounded-2xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 md:w-auto"
              >
                {loadingOrder ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-950 border-t-transparent" />
                    Fetching...
                  </span>
                ) : (
                  "Fetch order"
                )}
              </button>
            </div>
          </div>

          {formError && (
            <div className="mt-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
              {formError}
            </div>
          )}

          <div className="mt-6">
            {!selectedOrder ? (
              <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/40 p-6 text-sm text-slate-400">
                No order loaded yet.
              </div>
            ) : (
              <div className="space-y-6">
                <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-5">
                  <div className="mb-4 flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                        Order
                      </p>
                      <h3 className="mt-1 text-2xl font-bold text-white">
                        #{selectedOrder.id}
                      </h3>
                    </div>

                    <span
                      className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${getStatusClasses(
                        selectedOrder.status
                      )}`}
                    >
                      {prettyStatus(selectedOrder.status)}
                    </span>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                      <p className="text-xs uppercase tracking-wide text-slate-500">
                        Customer ID
                      </p>
                      <p className="mt-2 text-lg font-semibold text-white">
                        {selectedOrder.customer_id}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                      <p className="text-xs uppercase tracking-wide text-slate-500">
                        Reference
                      </p>
                      <p className="mt-2 break-all text-lg font-semibold text-white">
                        {selectedOrder.reference}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <h4 className="text-lg font-semibold text-white">Workflow</h4>
                    <p className="text-sm text-slate-400">
                      Current status:{" "}
                      <span className="font-medium text-slate-200">
                        {prettyStatus(selectedOrder.status)}
                      </span>
                    </p>
                  </div>

                  <div className="grid gap-3 md:grid-cols-5">
                    {workflowSteps.map((step, index) => {
                      const active = currentStepIndex >= index;
                      const current =
                        selectedOrder.status?.toLowerCase() ===
                        step.toLowerCase();

                      return (
                        <div
                          key={step}
                          className={`rounded-2xl border px-4 py-3 text-center text-sm font-medium transition ${
                            current
                              ? "border-cyan-400 bg-cyan-400/15 text-cyan-300"
                              : active
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                              : "border-slate-800 bg-slate-900/60 text-slate-500"
                          }`}
                        >
                          {prettyStatus(step)}
                        </div>
                      );
                    })}
                  </div>

                  {selectedOrder.status?.toLowerCase() === "cancelled" && (
                    <div className="mt-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
                      This order is cancelled. Further workflow actions may fail by
                      design.
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-5">
                  <h4 className="mb-4 text-lg font-semibold text-white">
                    Actions
                  </h4>

                  <div className="flex flex-wrap gap-3">
                    {actions.map((action) => {
                      const isLoading = actionLoading === action.key;

                      return (
                        <button
                          key={action.key}
                          onClick={() => runOrderAction(action.key)}
                          disabled={!!actionLoading}
                          className={`rounded-2xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                            action.danger
                              ? "border border-rose-400/30 bg-rose-500/90 text-white hover:bg-rose-500"
                              : "border border-slate-700 bg-slate-800 text-slate-100 hover:border-cyan-400 hover:text-cyan-300"
                          }`}
                        >
                          {isLoading ? (
                            <span className="flex items-center gap-2">
                              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                              Working...
                            </span>
                          ) : (
                            action.label
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-5">
                  <h4 className="mb-4 text-lg font-semibold text-white">
                    Items
                  </h4>

                  {selectedOrder.items && selectedOrder.items.length > 0 ? (
                    <div className="overflow-hidden rounded-2xl border border-slate-800">
                      <table className="min-w-full divide-y divide-slate-800">
                        <thead className="bg-slate-900/80">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                              Product ID
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                              Quantity
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800 bg-slate-950/40">
                          {selectedOrder.items.map((item, index) => (
                            <tr key={`${item.product_id}-${index}`}>
                              <td className="px-4 py-3 text-slate-200">
                                {item.product_id}
                              </td>
                              <td className="px-4 py-3 text-slate-200">
                                {item.qty}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/40 p-4 text-sm text-slate-400">
                      No items returned by the backend for this order.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}