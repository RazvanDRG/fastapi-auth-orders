import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import toast from "react-hot-toast";
import { http } from "../lib/http";
import { getErrorMessage } from "../lib/error";
import type { ActivityFeedItem, Order, OrderEvent } from "../types/api";

type DashboardMetrics = {
  totalOrders: number;
  newOrders: number;
  reservedOrders: number;
  inProgressOrders: number;
  shippedOrders: number;
  cancelledOrders: number;
};

type PaginationItem = number | "ellipsis";

const initialMetrics: DashboardMetrics = {
  totalOrders: 0,
  newOrders: 0,
  reservedOrders: 0,
  inProgressOrders: 0,
  shippedOrders: 0,
  cancelledOrders: 0,
};

const ACTIVITY_PAGE_SIZE = 10;

function formatRelativeTime(dateString: string) {
  const now = new Date().getTime();
  const created = new Date(dateString).getTime();
  const diffSeconds = Math.floor((now - created) / 1000);

  if (diffSeconds < 60) return "Just now";

  const minutes = Math.floor(diffSeconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function prettyStatus(status?: string | null) {
  if (!status || status === "-") return "Activity";

  return status
    .replace("OrderStatus.", "")
    .split("_")
    .join(" ")
    .toLowerCase()
    .replace(/\b\w/g, (c: string) => c.toUpperCase());
}

function getTargetStatus(description: string) {
  const matches = [...description.matchAll(/OrderStatus\.([A-Z_]+)/g)];
  return matches.length ? matches[matches.length - 1][1] : "ACTIVITY";
}

function getActivityEntityId(activity: ActivityFeedItem) {
  const match = activity.title.match(/#(\d+)/);
  return match ? Number(match[1]) : 0;
}

function getActivityAccent(description: string) {
  const status = getTargetStatus(description).toLowerCase();
  const value = description.toLowerCase();

  if (status.includes("shipped") || value.includes("shipped")) {
    return {
      dot: "bg-emerald-400 shadow-emerald-500/40",
      badge: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
    };
  }

  if (status.includes("cancel") || value.includes("cancel")) {
    return {
      dot: "bg-rose-400 shadow-rose-500/40",
      badge: "border-rose-500/20 bg-rose-500/10 text-rose-300",
    };
  }

  if (status.includes("pick") || value.includes("pick")) {
    return {
      dot: "bg-cyan-400 shadow-cyan-500/40",
      badge: "border-cyan-500/20 bg-cyan-500/10 text-cyan-300",
    };
  }

  if (status.includes("reserve") || value.includes("reserve")) {
    return {
      dot: "bg-amber-400 shadow-amber-500/40",
      badge: "border-amber-500/20 bg-amber-500/10 text-amber-300",
    };
  }

  if (status.includes("new") || value.includes("created")) {
    return {
      dot: "bg-slate-300 shadow-slate-400/40",
      badge: "border-slate-500/30 bg-slate-500/10 text-slate-200",
    };
  }

  return {
    dot: "bg-violet-400 shadow-violet-500/40",
    badge: "border-violet-500/20 bg-violet-500/10 text-violet-300",
  };
}

function getRoleBadge(role?: string | null) {
  switch ((role || "").toLowerCase()) {
    case "admin":
      return "border-rose-500/20 bg-rose-500/10 text-rose-300";
    case "operator":
      return "border-cyan-500/20 bg-cyan-500/10 text-cyan-300";
    case "service":
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300";
    default:
      return "border-slate-700 bg-slate-900 text-slate-300";
  }
}

function getActorLabel(role?: string | null, id?: number | null) {
  if (!id) return "Unknown";

  switch ((role || "").toLowerCase()) {
    case "admin":
      return `Admin ID #${id}`;
    case "operator":
      return `Operator ID #${id}`;
    case "service":
      return `Service ID #${id}`;
    default:
      return `User ID #${id}`;
  }
}

function getEventSearchText(activity: ActivityFeedItem) {
  return [
    activity.type,
    activity.title,
    activity.description,
    activity.actor_role,
    activity.actor_user_id,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function getPaginationItems(
  currentPage: number,
  totalPages: number
): PaginationItem[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set<number>([1, 2, totalPages - 1, totalPages]);

  if (currentPage > 2 && currentPage < totalPages - 1) {
    pages.add(currentPage);
  }

  const sortedPages = Array.from(pages).sort((a, b) => a - b);
  const items: PaginationItem[] = [];

  sortedPages.forEach((page, index) => {
    const previousPage = sortedPages[index - 1];

    if (index > 0 && previousPage && page - previousPage > 1) {
      items.push("ellipsis");
    }

    items.push(page);
  });

  return items;
}

export function DashboardPage() {
  const location = useLocation();

  const [metrics, setMetrics] = useState<DashboardMetrics>(initialMetrics);
  const [activityFeed, setActivityFeed] = useState<ActivityFeedItem[]>([]);
  const [activitySearch, setActivitySearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [activityPage, setActivityPage] = useState(1);

  const [orderLookupInput, setOrderLookupInput] = useState("");
  const [searchedOrderId, setSearchedOrderId] = useState<number | null>(null);
  const [searchedOrderEvents, setSearchedOrderEvents] = useState<OrderEvent[]>(
    []
  );

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingOrderEvents, setLoadingOrderEvents] = useState(false);

  useEffect(() => {
    if (!location.state?.loginSuccess) return;

    const toastKey = "dashboard_welcome_toast_shown";

    if (!sessionStorage.getItem(toastKey)) {
      sessionStorage.setItem(toastKey, "true");

      toast.success("Welcome back.", {
        id: "dashboard-welcome-toast",
      });
    }

    window.history.replaceState({}, document.title);

    return () => {
      sessionStorage.removeItem(toastKey);
    };
  }, [location.state]);

  useEffect(() => {
    loadDashboard(true);

    const interval = setInterval(() => {
      loadDashboard(false);
    }, 15000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setActivityPage(1);
  }, [activitySearch, statusFilter, roleFilter]);

  const filteredActivityFeed = useMemo(() => {
    const query = activitySearch.trim().toLowerCase();

    return activityFeed
      .filter((activity) => {
        const targetStatus = getTargetStatus(activity.description);
        const role = activity.actor_role || "";

        const matchesSearch =
          !query || getEventSearchText(activity).includes(query);

        const matchesStatus =
          statusFilter === "ALL" || targetStatus === statusFilter;

        const matchesRole =
          roleFilter === "ALL" ||
          role.toLowerCase() === roleFilter.toLowerCase();

        return matchesSearch && matchesStatus && matchesRole;
      })
      .sort((a, b) => {
        const idDifference = getActivityEntityId(b) - getActivityEntityId(a);

        if (idDifference !== 0) {
          return idDifference;
        }

        return (
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      });
  }, [activityFeed, activitySearch, statusFilter, roleFilter]);

  const totalActivityPages = Math.max(
    1,
    Math.ceil(filteredActivityFeed.length / ACTIVITY_PAGE_SIZE)
  );

  const paginatedActivityFeed = filteredActivityFeed.slice(
    (activityPage - 1) * ACTIVITY_PAGE_SIZE,
    activityPage * ACTIVITY_PAGE_SIZE
  );

  useEffect(() => {
    if (activityPage > totalActivityPages) {
      setActivityPage(totalActivityPages);
    }
  }, [activityPage, totalActivityPages]);

  async function loadDashboard(showLoader = false) {
    try {
      if (showLoader) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      const [ordersResponse, activityResponse] = await Promise.all([
        http.get<Order[]>("/orders/my"),
        http.get<ActivityFeedItem[]>(`/ops/activity?limit=100&t=${Date.now()}`),
      ]);

      const orders = ordersResponse.data ?? [];

      const nextMetrics: DashboardMetrics = {
        totalOrders: orders.length,
        newOrders: 0,
        reservedOrders: 0,
        inProgressOrders: 0,
        shippedOrders: 0,
        cancelledOrders: 0,
      };

      for (const order of orders) {
        switch (order.status) {
          case "NEW":
            nextMetrics.newOrders += 1;
            break;
          case "RESERVED":
            nextMetrics.reservedOrders += 1;
            break;
          case "PICKING":
          case "PICKED":
            nextMetrics.inProgressOrders += 1;
            break;
          case "SHIPPED":
            nextMetrics.shippedOrders += 1;
            break;
          case "CANCELLED":
            nextMetrics.cancelledOrders += 1;
            break;
          default:
            break;
        }
      }

      setMetrics(nextMetrics);
      setActivityFeed(activityResponse.data ?? []);
    } catch (err: unknown) {
      if (showLoader) {
        toast.error(getErrorMessage(err, "Failed to load dashboard."));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function searchOrderEvents() {
    const parsedId = Number(orderLookupInput);

    if (!parsedId || Number.isNaN(parsedId) || parsedId <= 0) {
      toast.error("Enter a valid order ID.");
      return;
    }

    try {
      setLoadingOrderEvents(true);

      const response = await http.get<OrderEvent[]>(
        `/orders/${parsedId}/events`
      );

      setSearchedOrderId(parsedId);
      setSearchedOrderEvents(response.data ?? []);
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, "Failed to load order activity."));
    } finally {
      setLoadingOrderEvents(false);
    }
  }

  function clearActivityFilters() {
    setActivitySearch("");
    setStatusFilter("ALL");
    setRoleFilter("ALL");
    setActivityPage(1);
  }

  const metricCards = useMemo(
    () => [
      {
        label: "Total orders",
        value: metrics.totalOrders,
        accent: "from-cyan-500/20 to-cyan-500/5 border-cyan-500/20",
      },
      {
        label: "New orders",
        value: metrics.newOrders,
        accent: "from-sky-500/20 to-sky-500/5 border-sky-500/20",
      },
      {
        label: "Reserved",
        value: metrics.reservedOrders,
        accent: "from-violet-500/20 to-violet-500/5 border-violet-500/20",
      },
      {
        label: "In progress",
        value: metrics.inProgressOrders,
        accent: "from-amber-500/20 to-amber-500/5 border-amber-500/20",
      },
      {
        label: "Shipped",
        value: metrics.shippedOrders,
        accent: "from-emerald-500/20 to-emerald-500/5 border-emerald-500/20",
      },
      {
        label: "Cancelled",
        value: metrics.cancelledOrders,
        accent: "from-rose-500/20 to-rose-500/5 border-rose-500/20",
      },
    ],
    [metrics]
  );

  const filtersActive = Boolean(
    activitySearch.trim() || statusFilter !== "ALL" || roleFilter !== "ALL"
  );

  const firstVisibleActivity =
    filteredActivityFeed.length === 0
      ? 0
      : (activityPage - 1) * ACTIVITY_PAGE_SIZE + 1;

  const lastVisibleActivity = Math.min(
    activityPage * ACTIVITY_PAGE_SIZE,
    filteredActivityFeed.length
  );

  return (
    <div className="space-y-8">
      <section className="rounded-[32px] border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-8 shadow-2xl shadow-black/20">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-[0.25em] text-cyan-300">
              Warehouse Operations Dashboard
            </p>

            <h1 className="mt-4 text-4xl font-black tracking-tight text-white">
              Operational overview
            </h1>

            <p className="mt-4 text-sm leading-7 text-slate-400">
              Monitor order lifecycle activity, workflow progression, and
              operational metrics across the warehouse system.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Link
              to="/orders"
              className="rounded-2xl border border-cyan-400/30 bg-cyan-400/10 px-5 py-4 text-sm font-semibold text-cyan-200 transition hover:bg-cyan-400/20"
            >
              Open Orders Workspace
            </Link>

            <Link
              to="/metrics"
              className="rounded-2xl border border-slate-700 bg-slate-900/70 px-5 py-4 text-sm font-semibold text-slate-200 transition hover:border-cyan-500/40 hover:text-cyan-200"
            >
              View System Metrics
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {metricCards.map((card) => (
          <div
            key={card.label}
            className={`rounded-3xl border bg-gradient-to-br p-6 ${card.accent}`}
          >
            <p className="text-sm font-medium text-slate-400">{card.label}</p>

            <div className="mt-4 flex items-end justify-between">
              <span className="text-4xl font-black text-white">
                {loading ? "--" : card.value}
              </span>

              <span
                className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide transition ${
                  refreshing
                    ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-300"
                    : "border-white/10 bg-white/5 text-slate-300"
                }`}
              >
                {refreshing ? "Refreshing" : "Live"}
              </span>
            </div>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
          <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">Recent activity</h2>

              <p className="mt-1 text-sm text-slate-400">
                Live operational events from order and admin audit streams.
              </p>
            </div>

            <button
              type="button"
              onClick={() => loadDashboard(false)}
              className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-cyan-500/40 hover:text-cyan-200"
            >
              Refresh
            </button>
          </div>

          <div className="mb-5 grid gap-3 lg:grid-cols-[1fr_auto]">
            <input
              type="text"
              value={activitySearch}
              onChange={(e) => setActivitySearch(e.target.value)}
              placeholder="Search by order, action, role, user ID..."
              className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/30"
            />

            {filtersActive && (
              <button
                type="button"
                onClick={clearActivityFilters}
                className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm font-semibold text-slate-300 transition hover:border-cyan-500/40 hover:text-cyan-200"
              >
                Clear
              </button>
            )}
          </div>

          <div className="mb-5 grid gap-3 md:grid-cols-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/30"
            >
              <option value="ALL">All statuses</option>
              <option value="NEW">New</option>
              <option value="RESERVED">Reserved</option>
              <option value="PICKING">Picking</option>
              <option value="PICKED">Picked</option>
              <option value="SHIPPED">Shipped</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="FAILED_RESERVATION">Failed reservation</option>
            </select>

            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/30"
            >
              <option value="ALL">All roles</option>
              <option value="admin">Admin</option>
              <option value="operator">Operator</option>
              <option value="service">Service</option>
            </select>
          </div>

          <div className="mb-5 rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
            <p className="text-sm font-semibold text-white">
              Search all actions for one order
            </p>

            <p className="mt-1 text-sm text-slate-400">
              Use this when you need the complete audit trail, not only the
              latest dashboard activity.
            </p>

            <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
              <input
                type="number"
                min={1}
                value={orderLookupInput}
                onChange={(e) => setOrderLookupInput(e.target.value)}
                placeholder="Order ID, e.g. 47"
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/30"
              />

              <button
                type="button"
                onClick={searchOrderEvents}
                disabled={loadingOrderEvents}
                className="rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingOrderEvents ? "Searching..." : "Search"}
              </button>
            </div>

            {searchedOrderId && (
              <div className="mt-4 space-y-3">
                <p className="text-sm font-semibold text-slate-300">
                  Order #{searchedOrderId} audit trail
                </p>

                {searchedOrderEvents.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/50 p-4 text-sm text-slate-400">
                    No events found for this order.
                  </div>
                ) : (
                  searchedOrderEvents.map((event) => {
                    const description = `${event.action} (${
                      event.from_status ?? "-"
                    } → ${event.to_status ?? "-"})`;
                    const accent = getActivityAccent(description);
                    const roleBadge = getRoleBadge(event.actor_role);

                    return (
                      <div
                        key={event.id}
                        className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex gap-3">
                            <div
                              className={`mt-1 h-3 w-3 rounded-full shadow-lg ${accent.dot}`}
                            />

                            <div>
                              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-300">
                                {event.action}
                              </p>

                              <p className="mt-2 text-sm font-bold text-white">
                                {prettyStatus(event.from_status)} →{" "}
                                {prettyStatus(event.to_status)}
                              </p>

                              <div className="mt-3 flex flex-wrap gap-2">
                                <span className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-xs font-medium text-slate-300">
                                  {getActorLabel(
                                    event.actor_role,
                                    event.actor_user_id
                                  )}
                                </span>

                                {event.actor_role && (
                                  <span
                                    className={`rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-wide ${roleBadge}`}
                                  >
                                    {event.actor_role}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <span className="whitespace-nowrap text-xs text-slate-500">
                            {formatRelativeTime(event.created_at)}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>

          <div className="mb-3 text-xs font-medium text-slate-500">
            Showing {firstVisibleActivity}-{lastVisibleActivity} of{" "}
            {filteredActivityFeed.length} filtered events · {activityFeed.length}{" "}
            total
          </div>

          <div className="space-y-3">
            {filteredActivityFeed.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/40 p-6 text-sm text-slate-400">
                No operational events matched your filters.
              </div>
            ) : (
              paginatedActivityFeed.map((activity, index) => {
                const accent = getActivityAccent(activity.description);
                const targetStatus = getTargetStatus(activity.description);
                const roleBadge = getRoleBadge(activity.actor_role);

                return (
                  <div
                    key={`${activity.title}-${activity.created_at}-${index}`}
                    className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4 transition hover:border-cyan-500/30"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex gap-4">
                        <div
                          className={`mt-1 h-3 w-3 rounded-full shadow-lg ${accent.dot}`}
                        />

                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-white">
                              {activity.title}
                            </p>

                            <span
                              className={`rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-wide ${accent.badge}`}
                            >
                              {prettyStatus(targetStatus)}
                            </span>
                          </div>

                          <p className="mt-2 text-sm text-slate-400">
                            {activity.description}
                          </p>

                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-medium text-slate-300">
                              {getActorLabel(
                                activity.actor_role,
                                activity.actor_user_id
                              )}
                            </span>

                            {activity.actor_role && (
                              <span
                                className={`rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-wide ${roleBadge}`}
                              >
                                {activity.actor_role}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <span className="whitespace-nowrap text-xs text-slate-500">
                        {formatRelativeTime(activity.created_at)}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {filteredActivityFeed.length > ACTIVITY_PAGE_SIZE && (
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setActivityPage((currentPage) =>
                    Math.max(1, currentPage - 1)
                  )
                }
                disabled={activityPage === 1}
                className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-semibold text-slate-400 transition hover:border-cyan-500/40 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Previous activity page"
              >
                ←
              </button>

              {getPaginationItems(activityPage, totalActivityPages).map(
                (item, index) => {
                  if (item === "ellipsis") {
                    return (
                      <span
                        key={`ellipsis-${index}`}
                        className="px-2 text-sm font-semibold text-slate-500"
                      >
                        …
                      </span>
                    );
                  }

                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setActivityPage(item)}
                      className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                        activityPage === item
                          ? "border-cyan-400 bg-cyan-400/15 text-cyan-300"
                          : "border-slate-700 bg-slate-950 text-slate-400 hover:border-cyan-500/40 hover:text-cyan-200"
                      }`}
                    >
                      {item}
                    </button>
                  );
                }
              )}

              <button
                type="button"
                onClick={() =>
                  setActivityPage((currentPage) =>
                    Math.min(totalActivityPages, currentPage + 1)
                  )
                }
                disabled={activityPage === totalActivityPages}
                className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-semibold text-slate-400 transition hover:border-cyan-500/40 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Next activity page"
              >
                →
              </button>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
            <h2 className="text-xl font-bold text-white">Workflow overview</h2>

            <p className="mt-2 text-sm leading-6 text-slate-400">
              Orders move through a controlled warehouse lifecycle:
              NEW → RESERVED → PICKING → PICKED → SHIPPED.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              {["NEW", "RESERVED", "PICKING", "PICKED", "SHIPPED"].map(
                (status) => (
                  <span
                    key={status}
                    className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-4 py-2 text-xs font-semibold tracking-wide text-cyan-300"
                  >
                    {status}
                  </span>
                )
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
            <h2 className="text-xl font-bold text-white">Quick actions</h2>

            <div className="mt-5 grid gap-3">
              <Link
                to="/orders"
                className="rounded-2xl border border-slate-700 bg-slate-950/60 px-5 py-4 text-sm font-semibold text-slate-200 transition hover:border-cyan-500/40 hover:text-cyan-200"
              >
                Create and manage orders
              </Link>

              <Link
                to="/metrics"
                className="rounded-2xl border border-slate-700 bg-slate-950/60 px-5 py-4 text-sm font-semibold text-slate-200 transition hover:border-cyan-500/40 hover:text-cyan-200"
              >
                Inspect system metrics
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}