import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import CreateOrderForm from "../components/orders/CreateOrderForm";
import { http } from "../lib/http";
import { getErrorMessage } from "../lib/error";
import type { Order, OrderEvent } from "../types/api";
import { getRoleBadgeClasses } from "../lib/roles";
import { useSSE } from "../hooks/useSSE";

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
const ORDERS_PAGE_SIZE = 8;

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
  PICKED: [{ key: "ship", label: "Ship" }],
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
  if (current) return "border-orange-400 bg-orange-400/15 text-orange-300";
  if (completed) return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  return "border-rose-500/25 bg-rose-500/10 text-rose-300";
}

function prettyStatus(status?: string | null) {
  if (!status) return "-";

  return status
    .replace("OrderStatus.", "")
    .split("_")
    .join(" ")
    .toLowerCase()
    .replace(/\b\w/g, (c: string) => c.toUpperCase());
}

function formatDateTime(dateString: string) {
  return new Date(dateString).toLocaleString();
}

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

export default function OrdersPage() {
  const { user } = useAuth();

  const [myOrders, setMyOrders] = useState<Order[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [ordersPage, setOrdersPage] = useState(1);
  const [productsRefreshKey, setProductsRefreshKey] = useState(0);

  const [orderIdInput, setOrderIdInput] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [orderEvents, setOrderEvents] = useState<OrderEvent[]>([]);

  const [loadingMyOrders, setLoadingMyOrders] = useState(false);
  const [loadingOrder, setLoadingOrder] = useState(false);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const [ordersSearch, setOrdersSearch] = useState("");
  const [ordersStartDate, setOrdersStartDate] = useState("");
  const [ordersEndDate, setOrdersEndDate] = useState("");

  const selectedOrderIdRef = useRef<number | null>(null);

  useEffect(() => {
    selectedOrderIdRef.current = selectedOrder?.id ?? null;
  }, [selectedOrder?.id]);

  const currentStepIndex = useMemo(() => {
    if (!selectedOrder?.status) return -1;
    return workflowSteps.indexOf(selectedOrder.status.toUpperCase());
  }, [selectedOrder?.status]);

  const availableActions =
    selectedOrder && !selectedOrder.archived_at
      ? actionsByStatus[selectedOrder.status?.toUpperCase()] ?? []
      : [];

  const orderStats = useMemo(() => {
    const normalized = myOrders.map((order) => order.status?.toUpperCase());

    return {
      total: myOrders.length,
      newOrders: normalized.filter((status) => status === "NEW").length,
      inProgress: normalized.filter((status) =>
        ["RESERVED", "PICKING", "PICKED"].includes(status)
      ).length,
      shipped: normalized.filter((status) => status === "SHIPPED").length,
      cancelled: normalized.filter((status) => status === "CANCELLED").length,
    };
  }, [myOrders]);

  const filteredOrders = useMemo(() => {
    const query = ordersSearch.trim().toLowerCase();

    return myOrders.filter((order) => {
      const searchableText = [
        order.id,
        order.reference,
        order.status,
        order.customer_id,
        ...(order.items ?? []).flatMap((item) => [
          item.product_id,
          item.product_name,
          item.qty,
        ]),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch = !query || searchableText.includes(query);

      const orderDate = showArchived
        ? order.archived_at ?? order.last_activity_at ?? null
        : order.last_activity_at ?? null;


      const orderTime = orderDate ? new Date(orderDate).getTime() : null;

      const startTime = ordersStartDate
        ? new Date(ordersStartDate).getTime()
        : null;

      const endTime = ordersEndDate
        ? new Date(ordersEndDate).getTime()
        : null;

      const matchesStart =
        !startTime || orderTime === null || orderTime >= startTime;

      const matchesEnd =
        !endTime || orderTime === null || orderTime <= endTime;

      return matchesSearch && matchesStart && matchesEnd;
    });
  }, [myOrders, ordersSearch, ordersStartDate, ordersEndDate]);

  const sortedOrders = useMemo(() => {
    return [...filteredOrders].sort((a, b) => b.id - a.id);
  }, [filteredOrders]);

  const totalOrderPages = Math.max(
    1,
    Math.ceil(sortedOrders.length / ORDERS_PAGE_SIZE)
  );

  const paginatedOrders = sortedOrders.slice(
    (ordersPage - 1) * ORDERS_PAGE_SIZE,
    ordersPage * ORDERS_PAGE_SIZE
  );

  useEffect(() => {
    if (ordersPage > totalOrderPages) {
      setOrdersPage(totalOrderPages);
    }
  }, [ordersPage, totalOrderPages]);

  useSSE((event) => {
    switch (event.type) {
      case "order_update":
        fetchMyOrders({ silent: true });

        if (selectedOrderIdRef.current) {
          fetchOrderById(selectedOrderIdRef.current, { silent: true });
          fetchOrderEvents(selectedOrderIdRef.current, { silent: true });
        }

        setProductsRefreshKey((prev) => prev + 1);
        break;

      case "inventory_update":
      case "product_created":
        setProductsRefreshKey((prev) => prev + 1);
        break;
    }
  });

  async function fetchMyOrders(options?: { silent?: boolean }) {
    try {
      if (!options?.silent) {
        setLoadingMyOrders(true);
      }

      const response = await http.get<Order[]>("/orders/my", {
        params: {
          archived: showArchived,
        },
      });

      setMyOrders(response.data);

      if (!options?.silent) {
        toast.success(
          showArchived
            ? "Archived orders refreshed."
            : "Active orders refreshed."
        );
      }
    } catch (err: unknown) {
      if (!options?.silent) {
        toast.error(getErrorMessage(err, "Failed to load your orders."));
      }
    } finally {
      if (!options?.silent) {
        setLoadingMyOrders(false);
      }
    }
  }

  async function fetchOrderEvents(
    orderId: number,
    options?: { silent?: boolean }
  ) {
    try {
      if (!options?.silent) {
        setLoadingEvents(true);
      }

      const response = await http.get<OrderEvent[]>(`/orders/${orderId}/events`);
      setOrderEvents(response.data);
    } catch (err: unknown) {
      if (!options?.silent) {
        toast.error(getErrorMessage(err, "Failed to load order timeline."));
      }
    } finally {
      if (!options?.silent) {
        setLoadingEvents(false);
      }
    }
  }

  async function fetchOrderById(id?: number, options?: { silent?: boolean }) {
    const parsedId = id ?? Number(orderIdInput);

    if (!options?.silent) {
      setFormError("");
    }

    if (!parsedId || Number.isNaN(parsedId) || parsedId <= 0) {
      if (!options?.silent) {
        setFormError("Enter a valid order ID.");
      }
      return;
    }

    try {
      if (!options?.silent) {
        setLoadingOrder(true);
      }

      const response = await http.get<Order>(`/orders/${parsedId}`);
      setSelectedOrder(response.data);
      setOrderIdInput(String(parsedId));

      await fetchOrderEvents(parsedId, { silent: options?.silent });

      if (!options?.silent) {
        toast.success(`Order ${parsedId} loaded.`);
      }
    } catch (err: unknown) {
      if (!options?.silent) {
        setSelectedOrder(null);
        setOrderEvents([]);
        toast.error(
          getErrorMessage(err, "Failed to load order. Check the ID and try again.")
        );
      }
    } finally {
      if (!options?.silent) {
        setLoadingOrder(false);
      }
    }
  }

  async function runOrderAction(action: string) {
    if (!selectedOrder?.id) {
      setFormError("Load an order first.");
      return;
    }

    if (selectedOrder.archived_at) {
      toast.error("Archived orders are read-only.");
      return;
    }

    try {
      setActionLoading(action);
      setFormError("");

      await http.post(`/orders/${selectedOrder.id}/${action}`);
      await fetchOrderById(selectedOrder.id, { silent: true });
      await fetchMyOrders({ silent: true });
      await fetchOrderEvents(selectedOrder.id, { silent: true });

      if (["reserve", "retry-reserve", "cancel"].includes(action)) {
        setProductsRefreshKey((prev) => prev + 1);
      }

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

    const interval = setInterval(() => {
      fetchMyOrders({ silent: true });

      if (selectedOrderIdRef.current) {
        fetchOrderById(selectedOrderIdRef.current, { silent: true });
        fetchOrderEvents(selectedOrderIdRef.current, { silent: true });
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [showArchived]);

  function exportOrdersCsv() {
    const headers = [
      "order_id",
      "status",
      "reference",
      "customer_id",
      "last_activity_at",
      "archived_at",
      "items",
    ];

    const escapeCsv = (value: string | number | null | undefined) => {
      const text = String(value ?? "");
      return `"${text.replace(/"/g, '""')}"`;
    };

    const rows = sortedOrders.map((order) => {
      const items = (order.items ?? [])
        .map((item) => {
          const productName = item.product_name ?? `Product ${item.product_id}`;
          return `${productName} ID:${item.product_id} Qty:${item.qty}`;
        })
        .join(" | ");

      return [
        order.id,
        order.status,
        order.reference ?? "-",
        order.customer_id,
        order.last_activity_at
          ? new Date(order.last_activity_at).toLocaleString()
          : "",
        order.archived_at ? new Date(order.archived_at).toLocaleString() : "",
        items,
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
    link.download = `${showArchived ? "archived" : "active"}-orders-${new Date()
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
            refreshKey={productsRefreshKey}
            onCreated={(id) => {
              setShowArchived(false);
              setOrdersPage(1);
              setOrderIdInput(String(id));
              fetchOrderById(id, { silent: true });
              fetchMyOrders({ silent: true });
              fetchOrderEvents(id, { silent: true });
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
                type="button"
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

                      {selectedOrder.archived_at && (
                        <div className="mt-3">
                          <span className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-300">
                            Archived
                          </span>
                        </div>
                      )}
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

                  {selectedOrder.archive_due_at && !selectedOrder.archived_at && (
                    <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-300">
                      Archive scheduled at{" "}
                      {formatDateTime(selectedOrder.archive_due_at)}.
                    </div>
                  )}

                  {selectedOrder.archived_at && (
                    <div className="mt-4 rounded-2xl border border-slate-700 bg-slate-900/70 p-4 text-sm text-slate-300">
                      Archived at {formatDateTime(selectedOrder.archived_at)}.
                    </div>
                  )}
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
                      const current = selectedOrder.status?.toUpperCase() === step;

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

                  {selectedOrder.archived_at ? (
                    <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/40 p-4 text-sm text-slate-400">
                      Archived orders are read-only.
                    </div>
                  ) : availableActions.length === 0 ? (
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
                            type="button"
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

                <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-5">
                  <h4 className="mb-4 text-lg font-semibold text-white">
                    Order timeline
                  </h4>

                  {loadingEvents ? (
                    <p className="text-sm text-slate-400">
                      Loading timeline...
                    </p>
                  ) : orderEvents.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/40 p-4 text-sm text-slate-400">
                      No timeline events recorded yet.
                    </div>
                  ) : (
                    <div className="relative space-y-4">
                      {orderEvents.map((event) => (
                        <div
                          key={event.id}
                          className="relative rounded-2xl border border-slate-800 bg-slate-900/50 p-4"
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-300">
                                {event.action}
                              </p>

                              <p className="mt-2 text-base font-bold text-white">
                                {prettyStatus(event.from_status)} →{" "}
                                {prettyStatus(event.to_status)}
                              </p>

                              <div className="mt-3 flex flex-wrap gap-2">
                                <span className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-xs font-medium text-slate-300">
                                  {event.actor_user_id
                                    ? event.actor_display_name
                                      ? `${event.actor_display_name} · User ID #${event.actor_user_id}`
                                      : `User ID #${event.actor_user_id}`
                                    : "Unknown user"}
                                </span>

                                <span
                                  className={`rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wide ${getRoleBadgeClasses(
                                    event.actor_role
                                  )}`}
                                >
                                  {event.actor_role || "unknown"}
                                </span>

                                {user?.role === "admin" && event.request_id && (
                                  <span className="max-w-full truncate rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-xs font-medium text-slate-400">
                                    Request: {event.request_id}
                                  </span>
                                )}
                              </div>
                            </div>

                            <span className="whitespace-nowrap text-xs text-slate-500">
                              {formatDateTime(event.created_at)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
          <p className="text-sm text-slate-400">
            {showArchived ? "Archived orders" : "Active orders"}
          </p>

          <p className="mt-2 text-3xl font-bold text-white">
            {orderStats.total}
          </p>
        </div>

        {!showArchived ? (
          <>
            <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
              <p className="text-sm text-slate-400">New orders</p>

              <p className="mt-2 text-3xl font-bold text-cyan-300">
                {orderStats.newOrders}
              </p>
            </div>

            <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
              <p className="text-sm text-slate-400">In progress</p>

              <p className="mt-2 text-3xl font-bold text-orange-300">
                {orderStats.inProgress}
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
              <p className="text-sm text-slate-400">Shipped</p>

              <p className="mt-2 text-3xl font-bold text-emerald-300">
                {orderStats.shipped}
              </p>
            </div>

            <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
              <p className="text-sm text-slate-400">Cancelled</p>

              <p className="mt-2 text-3xl font-bold text-rose-300">
                {orderStats.cancelled}
              </p>
            </div>
          </>
        )}
      </section>

      <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl shadow-black/20">
        <div className="mb-6 flex flex-col gap-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-white">My orders</h2>

              <p className="mt-1 text-sm text-slate-400">
                {showArchived
                  ? "Completed orders moved to the archive after the retention delay."
                  : "Active orders available for operational processing."}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowArchived(false);
                  setOrdersPage(1);
                  setOrdersSearch("");
                  setOrdersStartDate("");
                  setOrdersEndDate("");
                }}
                className={`rounded-2xl px-5 py-2.5 text-sm font-semibold transition ${
                  !showArchived
                    ? "bg-cyan-400 text-slate-950"
                    : "border border-slate-700 bg-slate-950 text-slate-300 hover:border-cyan-400/40 hover:text-cyan-200"
                }`}
              >
                Active orders
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowArchived(true);
                  setOrdersPage(1);
                  setOrdersSearch("");
                  setOrdersStartDate("");
                  setOrdersEndDate("");
                }}
                className={`rounded-2xl px-5 py-2.5 text-sm font-semibold transition ${
                  showArchived
                    ? "bg-cyan-400 text-slate-950"
                    : "border border-slate-700 bg-slate-950 text-slate-300 hover:border-cyan-400/40 hover:text-cyan-200"
                }`}
              >
                Archived orders
              </button>

              <span className="rounded-full border border-slate-700 bg-slate-950 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-300">
                {filteredOrders.length} orders
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <input
              value={ordersSearch}
              onChange={(e) => {
                setOrdersSearch(e.target.value);
                setOrdersPage(1);
              }}
              placeholder="Search by order ID, status, product, reference"
              className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400 xl:w-96"
            />

            <input
              type="datetime-local"
              value={ordersStartDate}
              onChange={(e) => {
                setOrdersStartDate(e.target.value);
                setOrdersPage(1);
              }}
              onClick={(e) => e.currentTarget.showPicker?.()}
              className="w-full cursor-pointer rounded-2xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-white outline-none transition focus:border-cyan-400 xl:w-60"
            />

            <input
              type="datetime-local"
              value={ordersEndDate}
              onChange={(e) => {
                setOrdersEndDate(e.target.value);
                setOrdersPage(1);
              }}
              onClick={(e) => e.currentTarget.showPicker?.()}
              className="w-full cursor-pointer rounded-2xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-white outline-none transition focus:border-cyan-400 xl:w-60"
            />

            <button
              type="button"
              onClick={exportOrdersCsv}
              disabled={sortedOrders.length === 0}
              className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              CSV report
            </button>
            
            <button
              type="button"
              onClick={() => fetchMyOrders()}
              disabled={loadingMyOrders}
              className="rounded-2xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-100 transition hover:border-cyan-400 hover:text-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loadingMyOrders ? "Refreshing..." : "Refresh"}
            </button>

            <button
              type="button"
              onClick={() => {
                setOrdersSearch("");
                setOrdersStartDate("");
                setOrdersEndDate("");
                setOrdersPage(1);
              }}
              className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:border-rose-500/40 hover:text-rose-300"
            >
              Clear
            </button>
          </div>
        </div>

        {filteredOrders.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/40 p-6 text-sm text-slate-400">
            {showArchived
              ? "No archived orders yet."
              : "No active orders available."}
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {paginatedOrders.map((order) => (
                <button
                  key={order.id}
                  type="button"
                  onClick={() => fetchOrderById(order.id, { silent: true })}
                  className={`cursor-pointer rounded-3xl border p-4 text-left transition-all duration-200 ${
                    selectedOrder?.id === order.id
                      ? "border-cyan-400 bg-cyan-400/5 shadow-lg shadow-cyan-500/10"
                      : "border-slate-800 bg-slate-900/60 hover:border-cyan-500/40"
                  }`}
                >
                  <div className="mb-3 flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                        Order
                      </p>

                      <p className="mt-1 text-lg font-bold text-white">
                        #{order.id}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusClasses(
                          order.status
                        )}`}
                      >
                        {prettyStatus(order.status)}
                      </span>

                      {order.archived_at && (
                        <span className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-300">
                          Archived
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="text-sm text-slate-400">
                    Reference:{" "}
                    <span className="text-slate-200">
                      {order.reference || "-"}
                    </span>
                  </p>

                  <div className="mt-4 space-y-2">
                    {order.items?.length ? (
                      <>
                        {order.items.slice(0, 2).map((item, index) => (
                          <div
                            key={`${order.id}-${item.product_id}-${index}`}
                            className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950/60 px-3 py-2"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-white">
                                {item.product_name ??
                                  `Product #${item.product_id}`}
                              </p>

                              <p className="text-xs text-slate-400">
                                Product ID: {item.product_id}
                              </p>
                            </div>

                            <div className="ml-3 shrink-0 rounded-full bg-cyan-500/10 px-2.5 py-1 text-xs font-semibold text-cyan-300">
                              Qty: {item.qty}
                            </div>
                          </div>
                        ))}

                        {order.items.length > 2 && (
                          <div className="rounded-2xl border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm text-slate-400">
                            +{order.items.length - 2} more items
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="text-sm text-slate-500">
                        No items returned.
                      </p>
                    )}
                  </div>
                  <div className="mt-5 border-t border-slate-800 pt-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500">
                      Last activity
                    </p>

                    <p className="mt-1 text-sm font-medium text-slate-300">
                      {order.last_activity_at
                        ? new Date(order.last_activity_at).toLocaleString()
                        : "No activity"}
                    </p>
                  </div>
                </button>
              ))}
            </div>

            {sortedOrders.length > ORDERS_PAGE_SIZE && (
              <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  disabled={ordersPage === 1}
                  onClick={() =>
                    setOrdersPage((prev) => Math.max(1, prev - 1))
                  }
                  className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-semibold text-slate-300 transition hover:border-cyan-500/40 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ←
                </button>

                {getPaginationItems(ordersPage, totalOrderPages).map(
                  (item, index) =>
                    item === "..." ? (
                      <span
                        key={`ellipsis-${index}`}
                        className="px-2 text-slate-500"
                      >
                        ...
                      </span>
                    ) : (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setOrdersPage(Number(item))}
                        className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                          ordersPage === item
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
                  disabled={ordersPage === totalOrderPages}
                  onClick={() =>
                    setOrdersPage((prev) =>
                      Math.min(totalOrderPages, prev + 1)
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