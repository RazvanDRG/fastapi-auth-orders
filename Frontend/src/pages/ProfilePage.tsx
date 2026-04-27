import { useState } from "react";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import { getErrorMessage } from "../lib/error";

export function ProfilePage() {
  const { user, isLoading, refreshProfile } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefreshProfile() {
    try {
      setRefreshing(true);
      await refreshProfile();
      toast.success("Profile refreshed.");
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, "Failed to refresh profile."));
    } finally {
      setRefreshing(false);
    }
  }

  const userId = (user as any)?.id ?? "-";

  const displayName =
    (user as any)?.first_name && (user as any)?.last_name
      ? `${(user as any).first_name} ${(user as any).last_name}`
      : (user as any)?.first_name ??
        (user as any)?.last_name ??
        "Not provided";

  const userEmail = user?.email ?? "-";
  const userRole = user?.role ?? "operator";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-bold tracking-tight text-white">Profile</h1>
        <p className="mt-2 text-sm text-slate-300">
          Live session data from <span className="text-cyan-300">/auth/me</span>.
        </p>
      </div>

      {isLoading ? (
        <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 text-slate-400">
          Loading profile...
        </div>
      ) : !user ? (
        <div className="rounded-3xl border border-rose-500/20 bg-rose-500/10 p-6 text-rose-300">
          No active profile found. Please sign in again.
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          
          {/* USER DETAILS */}
          <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl shadow-black/20">
            <div className="mb-6">
              <h2 className="text-2xl font-semibold text-white">User details</h2>
              <p className="mt-1 text-sm text-slate-400">
                Authenticated user information currently loaded in session context.
              </p>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Display name
                </p>
                <p className="mt-2 break-all text-lg font-semibold text-white">
                  {displayName}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Email
                </p>
                <p className="mt-2 break-all text-lg font-semibold text-white">
                  {userEmail}
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-500">
                    User ID
                  </p>
                  <p className="mt-2 text-lg font-semibold text-white">{userId}</p>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-500">
                    Role
                  </p>
                  <span className="mt-2 inline-flex rounded-full bg-cyan-400/15 px-3 py-1 text-sm font-semibold text-cyan-300">
                    {userRole}
                  </span>
                </div>
              </div>

              <button
                onClick={handleRefreshProfile}
                disabled={refreshing}
                className="rounded-2xl border border-slate-700 bg-slate-800 px-5 py-3 text-sm font-semibold text-slate-100 transition hover:border-cyan-400 hover:text-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {refreshing ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Refreshing...
                  </span>
                ) : (
                  "Refresh profile"
                )}
              </button>
            </div>
          </section>

          {/* SESSION SECURITY */}
          <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl shadow-black/20">
            <div className="mb-6">
              <h2 className="text-2xl font-semibold text-white">
                Session security
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                Authentication state is active and managed securely by the application.
              </p>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Session status
                </p>
                <span className="mt-2 inline-flex rounded-full bg-emerald-500/15 px-3 py-1 text-sm font-semibold text-emerald-300">
                  Active
                </span>
              </div>

              <div className="rounded-2xl border border-slate-700/60 bg-slate-950/40 p-4 text-sm text-slate-300">
                <span className="font-semibold text-cyan-300">
                  Security note:
                </span>{" "}
                tokens are intentionally not displayed in the UI to avoid exposing
                sensitive session data.
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}