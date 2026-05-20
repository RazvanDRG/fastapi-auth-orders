import { useEffect, useMemo, useState } from "react";
import { http } from "../lib/http";
import { getErrorMessage, parseMetrics } from "../lib/utils";

export function MetricsPage() {
  const [rawMetrics, setRawMetrics] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadMetrics() {
    try {
      setLoading(true);
      setError("");

      const { data } = await http.get<string>("/metrics", {
        responseType: "text",
      });

      setRawMetrics(data);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMetrics();
  }, []);

  const metrics = useMemo(() => parseMetrics(rawMetrics), [rawMetrics]);

  return (
    <div className="space-y-6">
      <section className="rounded-[32px] border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-8 shadow-2xl shadow-black/20">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300">
              SYSTEM OBSERVABILITY
            </p>

            <h1 className="mt-4 text-4xl font-black tracking-tight text-white">
              Metrics
            </h1>

            <p className="mt-3 text-sm text-slate-400">
              Admin-only Prometheus endpoint preview.
            </p>
          </div>

          <button
            type="button"
            onClick={loadMetrics}
            disabled={loading}
            className="rounded-2xl border border-cyan-500/40 bg-cyan-500/10 px-5 py-3 text-sm font-semibold text-cyan-300 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Refreshing..." : "Refresh metrics"}
          </button>
        </div>
      </section>

      {error && (
        <div className="rounded-3xl border border-rose-500/40 bg-rose-950/30 px-5 py-4 text-sm font-medium text-rose-200">
          {error.includes("403")
            ? "Access denied. Metrics are available only for administrator accounts."
            : error}
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {metrics.slice(0, 6).map((metric) => (
          <div
            key={metric.metric}
            className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5"
          >
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Metric
            </p>

            <p className="mt-3 text-3xl font-bold text-white">
              {metric.value}
            </p>

            <p className="mt-2 break-all text-sm text-slate-400">
              {metric.metric}
            </p>
          </div>
        ))}
      </section>

      <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl shadow-black/20">
        <div className="mb-5">
          <h2 className="text-2xl font-semibold text-white">Raw scrape</h2>

          <p className="mt-1 text-sm text-slate-400">
            Useful in a backend-oriented interview discussion.
          </p>
        </div>

        <pre className="max-h-[560px] overflow-auto rounded-2xl border border-slate-800 bg-slate-950 p-4 text-xs leading-6 text-slate-300">
          {rawMetrics || "No metrics loaded yet."}
        </pre>
      </section>
    </div>
  );
}