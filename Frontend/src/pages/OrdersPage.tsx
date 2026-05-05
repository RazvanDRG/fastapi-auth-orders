import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import CreateOrderForm from "../components/orders/CreateOrderForm";
import { http } from "../lib/http";
import { getErrorMessage } from "../lib/error";
import type { Order } from "../types/api";

type OrderAction = {
  key: string;
  label: string;
  danger?: boolean;
};

const statusToneMap: Record<string, string> = {
  NEW: "bg-slate-700/70 text-slate-100 border border-slate-600",
  RESERVED: "bg-amber-500/15 text-amber-300 border border-amber-500/30",
  PICKING: "bg-sky-500/15 text-sky-300 border border-sky-500/30",
  PICKED: "bg-violet-500/15 text-violet-300 border border-violet-500/30",
  SHIPPED: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30",
  CANCELLED: "bg-rose-500/15 text-rose-300 border border-rose-500/30",
  FAILED_RESERVATION:
    "bg-orange-500/15 text-orange-300 border border-orange-500/30",
};

const workflowSteps = ["NEW", "RESERVED", "PICKING", "PICKED", "SHIPPED"];

const actionsByStatus: Record<string, OrderAction[]> = {
  NEW: [
    { key: "reserve", label: "Reserve" },
    { key: "cancel", label: "Cancel", danger: true },
  ],
  FAILED_RESERVATION: [
    { key: "retry-reserve", label: "Retry reserve" },
    { key: "cancel", label: "Cancel", danger: true },
  ],
  RESERVED: [
    { key: "start-pick", label: "Start pick" },
    { key: "cancel", label: "Cancel", danger: true },
  ],
  PICKING: [
    { key: "confirm-pick", label: "Confirm pick" },
    { key: "cancel", label: "Cancel", danger: true },
  ],
  PICKED: [
    { key: "ship", label: "Ship" },
  ],
  SHIPPED: [],
  CANCELLED: [],
};

function getStatusClasses(status?: string) {
  return (
    statusToneMap[(status || "").toUpperCase()] ||
    "bg-slate-700/70 text-slate-100 border border-slate-600"
  );
}

function getWorkflowStepClasses(current: boolean, completed: boolean) {
  if (current) {
    return "border-orange-400 bg-orange-400/15 text-orange-300";
  }

  if (completed) {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  }

  return "border-rose-500/25 bg-rose-500/10 text-rose-300";
}

function prettyStatus(status?: string) {
  if (!status) return "-";

  return status
    .split("_")
    .join(" ")
    .toLowerCase()
    .replace(/\b\w/g, (c: string) => c.toUpperCase());
}

export default function OrdersPage() {
  const [myOrders, setMyOrders] = useState<Order[]>([]);
  const [orderIdInput, setOrderIdInput] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  const [loadingMyOrders, setLoadingMyOrders] = useState(false);
  const [loadingOrder, setLoadingOrder] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [formError, setFormError] = useState("");

  const currentStepIndex = useMemo(() => {
    if (!selectedOrder?.status) return -1;
    return workflowSteps.indexOf(selectedOrder.status.toUpperCase());
  }, [selectedOrder?.status]);

  const availableActions = selectedOrder
    ? actionsByStatus[selectedOrder.status?.toUpperCase()] ?? []
    : [];

  async function fetchMyOrders(options?: { silent?: boolean }) {
    try {
      setLoadingMyOrders(true);

      const response = await http.get<Order[]>("/orders/my");
      setMyOrders(response.data);

      if (!options?.silent) {
        toast.success("Orders list refreshed.");
      }
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, "Failed to load your orders."));
    } finally {
      setLoadingMyOrders(false);
    }
  }

  async function fetchOrderById(id?: number, options?: { silent?: boolean }) {
    const parsedId = id ?? Number(orderIdInput);

    setFormError("");

    if (!parsedId || Number.isNaN(parsedId) || parsedId <= 0) {
      setFormError("Enter a valid order ID.");
      return;
    }

    try {
      setLoadingOrder(true);

      const response = await http.get<Order>(`/orders/${parsedId}`);
      setSelectedOrder(response.data);
      setOrderIdInput(String(parsedId));

      if (!options?.silent) {
        toast.success(`Order ${parsedId} loaded.`);
      }
    } catch (err: unknown) {
      setSelectedOrder(null);
      toast.error(
        getErrorMessage(err, "Failed to load order. Check the ID and try again.")
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

      await http.post(`/orders/${selectedOrder.id}/${action}`);
      await fetchOrderById(selectedOrder.id, { silent: true });
      await fetchMyOrders({ silent: true });

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

  useEffect(() => {
    fetchMyOrders({ silent: true });
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-bold tracking-tight text-white">
          Orders workflow
        </h1>
        <p className="mt-2 text-sm text-slate-300">
          Create an order from product cards, review your orders, then drive the
          warehouse lifecycle.
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
              Choose products, set quantities, and submit a new order.
            </p>
          </div>

          <CreateOrderForm
            onCreated={(id) => {
              setOrderIdInput(String(id));
              fetchOrderById(id, { silent: true });
              fetchMyOrders({ silent: true });
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
              Continue an existing order by ID and execute lifecycle actions.
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
                {loadingOrder ? "Fetching..." : "Fetch order"}
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
                        {selectedOrder.reference || "-"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-5">
                  <div className="mb-4 flex items-center justify-between gap-4">
                    <h4 className="text-lg font-semibold text-white">
                      Workflow
                    </h4>
                    <p className="text-sm text-slate-400">
                      Current status:{" "}
                      <span className="font-medium text-orange-300">
                        {prettyStatus(selectedOrder.status)}
                      </span>
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    {workflowSteps.map((step, index) => {
                      const completed = currentStepIndex > index;
                      const current =
                        selectedOrder.status?.toUpperCase() === step;

                      return (
                        <div
                          key={step}
                          className={`min-w-[110px] rounded-2xl border px-4 py-3 text-center text-sm font-semibold transition ${getWorkflowStepClasses(
                            current,
                            completed
                          )}`}
                        >
                          {prettyStatus(step)}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-5">
                  <h4 className="mb-4 text-lg font-semibold text-white">
                    Actions
                  </h4>

                  {availableActions.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/40 p-4 text-sm text-slate-400">
                      No available actions for this order status.
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-3">
                      {availableActions.map((action) => {
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
                            {isLoading ? "Working..." : action.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-5">
                  <h4 className="mb-4 text-lg font-semibold text-white">
                    Items
                  </h4>

                  {selectedOrder.items?.length ? (
                    <div className="space-y-3">
                      {selectedOrder.items.map((item, index) => (
                        <div
                          key={`${item.product_id}-${index}`}
                          className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4"
                        >
                          <p className="font-semibold text-white">
                            {item.product_name || `Product #${item.product_id}`}
                          </p>
                          <p className="mt-1 text-sm text-slate-400">
                            Product ID: {item.product_id} · Quantity: {item.qty}
                          </p>
                        </div>
                      ))}
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

      <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl shadow-black/20">
        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-white">My orders</h2>
            <p className="mt-1 text-sm text-slate-400">
              Orders created by the currently authenticated user.
            </p>
          </div>

          <button
            type="button"
            onClick={() => fetchMyOrders()}
            disabled={loadingMyOrders}
            className="inline-flex w-fit rounded-2xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-100 transition hover:border-cyan-400 hover:text-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loadingMyOrders ? "Refreshing..." : "Refresh list"}
          </button>
        </div>

        {myOrders.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/40 p-6 text-sm text-slate-400">
            No orders created yet.
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {myOrders.map((order) => (
              <button
                key={order.id}
                type="button"
                onClick={() => fetchOrderById(order.id)}
                className="rounded-2xl border border-slate-800 bg-slate-950/40 p-5 text-left transition hover:border-cyan-400/60"
              >
                <div className="mb-3 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                      Order
                    </p>
                    <p className="mt-1 text-xl font-bold text-white">
                      #{order.id}
                    </p>
                  </div>

                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusClasses(
                      order.status
                    )}`}
                  >
                    {prettyStatus(order.status)}
                  </span>
                </div>

                <p className="text-sm text-slate-400">
                  Reference:{" "}
                  <span className="text-slate-200">
                    {order.reference || "-"}
                  </span>
                </p>

                <div className="mt-3 space-y-1 text-sm text-slate-400">
                  {order.items?.length ? (
                    order.items.map((item, index) => (
                      <p key={`${order.id}-${item.product_id}-${index}`}>
                        {item.product_name || `Product #${item.product_id}`} ×{" "}
                        {item.qty}
                      </p>
                    ))
                  ) : (
                    <p>No items returned.</p>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}