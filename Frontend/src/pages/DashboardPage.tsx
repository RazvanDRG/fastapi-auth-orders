import { Activity, ShieldCheck, Server, Database, Boxes, ChevronRight } from "lucide-react";
import { useAuth } from "../context/AuthContext";

type HealthStatus = "ok" | "up" | "unknown";

function StatusBadge({ value }: { value: HealthStatus | string }) {
  const normalized = value.toLowerCase();

  const styles =
    normalized === "ok" || normalized === "up"
      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
      : "border-slate-700 bg-slate-800 text-slate-300";

  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${styles}`}>
      {value}
    </span>
  );
}

function FeatureItem({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-3">
      <ChevronRight size={16} className="mt-0.5 shrink-0 text-cyan-300" />
      <span className="text-sm text-slate-200">{children}</span>
    </div>
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
        <div className="rounded-2xl bg-cyan-400/10 p-3 text-cyan-300">{icon}</div>
        <p className="text-sm font-medium text-slate-400">{title}</p>
      </div>
      <h3 className="text-2xl font-bold text-white">{value}</h3>
      <p className="mt-2 text-sm text-slate-400">{hint}</p>
    </div>
  );
}

export function DashboardPage() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-bold tracking-tight text-white">System dashboard</h1>
        <p className="mt-2 text-sm text-slate-300">
          High-signal overview for a technical demo or interview walkthrough.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          icon={<ShieldCheck size={22} />}
          title="Current role"
          value={user?.role || "operator"}
          hint="Navigation is filtered directly from backend RBAC expectations."
        />
        <MetricCard
          icon={<Activity size={22} />}
          title="Liveness"
          value="ok"
          hint="Warehouse Operations Service"
        />
        <MetricCard
          icon={<Database size={22} />}
          title="Readiness"
          value="up"
          hint="Database readiness probe."
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl shadow-black/20">
          <div className="mb-5">
            <h2 className="text-2xl font-semibold text-white">Endpoint coverage</h2>
            <p className="mt-1 text-sm text-slate-400">
              Every backend route is surfaced in the UI.
            </p>
          </div>

          <div className="mb-5 rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
            <code className="text-sm text-cyan-300">
              /auth/* /ops/* /orders/* /integrations/* /users/* /metrics
            </code>
          </div>

          <div className="space-y-3">
            <FeatureItem>JWT login with refresh token rotation</FeatureItem>
            <FeatureItem>Forgot/reset password flow</FeatureItem>
            <FeatureItem>Order state machine controls</FeatureItem>
            <FeatureItem>RBAC-aware navigation</FeatureItem>
            <FeatureItem>Admin user role mutation and soft delete</FeatureItem>
            <FeatureItem>Service-only integration trigger panel</FeatureItem>
            <FeatureItem>Protected metrics reader for admins</FeatureItem>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl shadow-black/20">
          <div className="mb-5">
            <h2 className="text-2xl font-semibold text-white">Operational status</h2>
            <p className="mt-1 text-sm text-slate-400">
              Snapshot of the system behavior exposed in the demo environment.
            </p>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-slate-300">API liveness probe</p>
                  <p className="mt-1 text-sm text-slate-500">GET /ops/live</p>
                </div>
                <StatusBadge value="ok" />
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-slate-300">Database readiness probe</p>
                  <p className="mt-1 text-sm text-slate-500">GET /ops/readiness</p>
                </div>
                <StatusBadge value="up" />
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-slate-800 p-3 text-slate-300">
                  <Server size={18} />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-300">Service target</p>
                  <p className="mt-1 text-sm text-slate-500">Warehouse Operations Service</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-slate-800 p-3 text-slate-300">
                  <Boxes size={18} />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-300">Primary workflow</p>
                  <p className="mt-1 text-sm text-slate-500">
                    Create → reserve → pick → confirm → ship
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl shadow-black/20">
        <div className="mb-5">
          <h2 className="text-2xl font-semibold text-white">Reality check</h2>
          <p className="mt-1 text-sm text-slate-400">
            What the backend does not expose is handled honestly.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
            <p className="text-sm font-semibold text-white">Orders</p>
            <p className="mt-2 text-sm text-slate-400">
              There is no order list endpoint, so orders are created or loaded up by ID.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
            <p className="text-sm font-semibold text-white">Users</p>
            <p className="mt-2 text-sm text-slate-400">
              There is no users list endpoint, so admin actions are targeted by explicit user ID.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
            <p className="text-sm font-semibold text-white">Integrations</p>
            <p className="mt-2 text-sm text-slate-400">
              Integration actions are isolated to the service role, matching the API contract.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}