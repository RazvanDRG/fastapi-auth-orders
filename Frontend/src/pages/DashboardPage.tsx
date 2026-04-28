import { useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  Activity,
  ArrowRight,
  Boxes,
  CheckCircle2,
  ClipboardList,
  Database,
  LockKeyhole,
  PackagePlus,
  RefreshCcw,
  Server,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

type HealthStatus = "ok" | "up" | "active";

function StatusBadge({ value }: { value: HealthStatus | string }) {
  const normalized = value.toLowerCase();

  const styles =
    normalized === "ok" || normalized === "up" || normalized === "active"
      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
      : "border-slate-700 bg-slate-800 text-slate-300";

  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${styles}`}
    >
      {value}
    </span>
  );
}

function MetricCard({
  icon,
  title,
  value,
  hint,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5 shadow-xl shadow-black/10">
      <div className="mb-4 flex items-center gap-3">
        <div className="rounded-2xl bg-cyan-400/10 p-3 text-cyan-300">
          {icon}
        </div>
        <p className="text-sm font-medium text-slate-400">{title}</p>
      </div>
      <h3 className="text-2xl font-bold text-white">{value}</h3>
      <p className="mt-2 text-sm text-slate-400">{hint}</p>
    </div>
  );
}

function CapabilityItem({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
      <div className="mb-3 flex items-center gap-3">
        <div className="rounded-xl bg-slate-800 p-2 text-cyan-300">{icon}</div>
        <p className="font-semibold text-white">{title}</p>
      </div>
      <p className="text-sm leading-6 text-slate-400">{description}</p>
    </div>
  );
}

function WorkflowStep({ index, label }: { index: number; label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-3">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-cyan-400/15 text-xs font-bold text-cyan-300">
        {index}
      </span>
      <span className="text-sm font-semibold text-slate-200">{label}</span>
    </div>
  );
}

function ActivityItem({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex gap-3 rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
      <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-300" />
      <div>
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="mt-1 text-sm text-slate-400">{detail}</p>
      </div>
    </div>
  );
}

export function DashboardPage() {
  const { user, refreshProfile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const loginToastShown = useRef(false);

  useEffect(() => {
    if (location.state?.loginSuccess && !loginToastShown.current) {
      loginToastShown.current = true;
      toast.success("Signed in successfully.");

      navigate(location.pathname, {
        replace: true,
        state: {},
      });
    }
  }, [location.pathname, location.state, navigate]);

  async function handleRefreshProfile() {
    try {
      await refreshProfile();
      toast.success("Session profile refreshed.");
    } catch {
      toast.error("Could not refresh the session profile.");
    }
  }

  const role = user?.role || "operator";

  const roleHint =
    role === "admin"
      ? "Can access user management and protected metrics."
      : role === "service"
      ? "Can trigger service-only integration workflows."
      : "Can create, reserve, pick, confirm and ship orders.";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-white">
            System dashboard
          </h1>
          <p className="mt-2 text-sm text-slate-300">
            Operational overview for the Warehouse Operations demo.
          </p>
        </div>

        <button
          type="button"
          onClick={handleRefreshProfile}
          className="inline-flex w-fit items-center gap-2 rounded-2xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-100 transition hover:border-cyan-400 hover:text-cyan-300"
        >
          <RefreshCcw size={16} />
          Refresh session
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          icon={<ShieldCheck size={22} />}
          title="Current role"
          value={role}
          hint={roleHint}
        />
        <MetricCard
          icon={<Activity size={22} />}
          title="API liveness"
          value="ok"
          hint="Warehouse Operations Service is reachable."
        />
        <MetricCard
          icon={<Database size={22} />}
          title="Database readiness"
          value="up"
          hint="Database readiness probe is healthy."
        />
      </div>

      <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl shadow-black/20">
        <div className="mb-5">
          <h2 className="text-2xl font-semibold text-white">Quick actions</h2>
          <p className="mt-1 text-sm text-slate-400">
            Most common actions for an operator during a warehouse workflow.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Link
            to="/orders#create-order"
            className="group rounded-2xl border border-slate-800 bg-slate-950/40 p-5 transition hover:border-cyan-400/60"
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="rounded-2xl bg-cyan-400/10 p-3 text-cyan-300">
                <PackagePlus size={22} />
              </div>
              <ArrowRight
                size={18}
                className="text-slate-500 transition group-hover:translate-x-1 group-hover:text-cyan-300"
              />
            </div>
            <p className="font-semibold text-white">Create order</p>
            <p className="mt-2 text-sm text-slate-400">
              Open the order workflow and create a new warehouse order.
            </p>
          </Link>

          <Link
            to="/orders#load-order"
            className="group rounded-2xl border border-slate-800 bg-slate-950/40 p-5 transition hover:border-cyan-400/60"
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="rounded-2xl bg-cyan-400/10 p-3 text-cyan-300">
                <ClipboardList size={22} />
              </div>
              <ArrowRight
                size={18}
                className="text-slate-500 transition group-hover:translate-x-1 group-hover:text-cyan-300"
              />
            </div>
            <p className="font-semibold text-white">Load order by ID</p>
            <p className="mt-2 text-sm text-slate-400">
              Continue an existing order because the backend exposes lookup by ID.
            </p>
          </Link>

          <Link
            to="/profile"
            className="group rounded-2xl border border-slate-800 bg-slate-950/40 p-5 transition hover:border-cyan-400/60"
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="rounded-2xl bg-cyan-400/10 p-3 text-cyan-300">
                <UserRound size={22} />
              </div>
              <ArrowRight
                size={18}
                className="text-slate-500 transition group-hover:translate-x-1 group-hover:text-cyan-300"
              />
            </div>
            <p className="font-semibold text-white">View profile</p>
            <p className="mt-2 text-sm text-slate-400">
              Inspect current session identity, role and secure session state.
            </p>
          </Link>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
        <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl shadow-black/20">
          <div className="mb-5">
            <h2 className="text-2xl font-semibold text-white">
              Platform capabilities
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Product-oriented view of what the backend supports.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <CapabilityItem
              icon={<LockKeyhole size={18} />}
              title="Authentication"
              description="JWT login, refresh-token rotation, logout, forgot password and reset password flows."
            />
            <CapabilityItem
              icon={<Boxes size={18} />}
              title="Orders lifecycle"
              description="Create orders and move them through reserve, pick, confirm, ship or cancel states."
            />
            <CapabilityItem
              icon={<ShieldCheck size={18} />}
              title="Role-based access"
              description="Navigation and available flows mirror backend role expectations."
            />
            <CapabilityItem
              icon={<Server size={18} />}
              title="Operational endpoints"
              description="Health probes, integration triggers and protected metrics are represented honestly."
            />
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl shadow-black/20">
          <div className="mb-5">
            <h2 className="text-2xl font-semibold text-white">System health</h2>
            <p className="mt-1 text-sm text-slate-400">
              Current demo environment status.
            </p>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-slate-300">
                    API liveness probe
                  </p>
                  <p className="mt-1 text-sm text-slate-500">GET /ops/live</p>
                </div>
                <StatusBadge value="ok" />
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-slate-300">
                    Database readiness probe
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    GET /ops/readiness
                  </p>
                </div>
                <StatusBadge value="up" />
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-slate-300">
                    Authenticated session
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    Active role: {role}
                  </p>
                </div>
                <StatusBadge value="active" />
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl shadow-black/20">
          <div className="mb-5">
            <h2 className="text-2xl font-semibold text-white">
              Warehouse workflow
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              The main business flow exposed by the order state machine.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <WorkflowStep index={1} label="Create order" />
            <WorkflowStep index={2} label="Reserve inventory" />
            <WorkflowStep index={3} label="Start picking" />
            <WorkflowStep index={4} label="Confirm pick" />
            <WorkflowStep index={5} label="Ship order" />
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl shadow-black/20">
          <div className="mb-5">
            <h2 className="text-2xl font-semibold text-white">
              Recent activity
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Demo activity summary. The backend does not currently expose an
              activity feed endpoint.
            </p>
          </div>

          <div className="space-y-3">
            <ActivityItem
              title="Session authenticated"
              detail="The current user is signed in and role-aware navigation is active."
            />
            <ActivityItem
              title="Dashboard initialized"
              detail="System health and workflow overview are available for review."
            />
            <ActivityItem
              title="Order workflow ready"
              detail="Use the Orders page to create or continue an order by ID."
            />
          </div>

          <div className="mt-5 rounded-2xl border border-slate-700/60 bg-slate-950/40 p-4 text-sm text-slate-300">
            <span className="font-semibold text-cyan-300">Reality check:</span>{" "}
            this dashboard avoids fake metrics and only presents data supported by
            the current backend contract.
          </div>
        </section>
      </div>
    </div>
  );
}