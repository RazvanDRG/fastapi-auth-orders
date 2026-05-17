import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import { http } from "../lib/http";
import { getErrorMessage } from "../lib/error";

export function ProfilePage() {
  const { user, refreshProfile } = useAuth();

  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const [firstName, setFirstName] = useState(user?.first_name ?? "");
  const [lastName, setLastName] = useState(user?.last_name ?? "");

  useEffect(() => {
    setFirstName(user?.first_name ?? "");
    setLastName(user?.last_name ?? "");
  }, [user?.first_name, user?.last_name]);

  const displayName =
    [user?.first_name, user?.last_name].filter(Boolean).join(" ") ||
    "Not provided";

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

  async function handleSaveProfile() {
    const cleanFirstName = firstName.trim();
    const cleanLastName = lastName.trim();

    if (!cleanFirstName || !cleanLastName) {
      toast.error("First name and last name are required.");
      return;
    }

    try {
      setSaving(true);

      await http.patch("/auth/me", {
        first_name: cleanFirstName,
        last_name: cleanLastName,
      });

      await refreshProfile();
      setIsEditing(false);

      toast.success("Profile updated.");
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, "Failed to update profile."));
    } finally {
      setSaving(false);
    }
  }

  function handleCancelEdit() {
    setFirstName(user?.first_name ?? "");
    setLastName(user?.last_name ?? "");
    setIsEditing(false);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-bold tracking-tight text-white">
          Profile
        </h1>

        <p className="mt-2 text-sm text-slate-300">
          Live session data from{" "}
          <span className="font-semibold text-cyan-300">/auth/me</span>.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
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

              <p className="mt-3 text-lg font-semibold text-white">
                {displayName}
              </p>
            </div>

            {isEditing && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                  <label className="mb-2 block text-xs uppercase tracking-wide text-slate-500">
                    First name
                  </label>

                  <input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="First name"
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/30"
                  />
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                  <label className="mb-2 block text-xs uppercase tracking-wide text-slate-500">
                    Last name
                  </label>

                  <input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Last name"
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/30"
                  />
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">
                Email
              </p>

              <p className="mt-3 break-all text-lg font-semibold text-white">
                {user?.email ?? "-"}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  User ID
                </p>

                <p className="mt-3 text-lg font-semibold text-white">
                  {user?.id ?? "-"}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Role
                </p>

                <span className="mt-3 inline-flex rounded-full bg-cyan-500/15 px-3 py-1 text-sm font-semibold text-cyan-300">
                  {user?.role ?? "-"}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleRefreshProfile}
                disabled={refreshing}
                className="rounded-2xl border border-slate-700 bg-slate-800 px-5 py-3 text-sm font-semibold text-slate-100 transition hover:border-cyan-400 hover:text-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {refreshing ? "Refreshing..." : "Refresh profile"}
              </button>

              {isEditing ? (
                <>
                  <button
                    type="button"
                    onClick={handleSaveProfile}
                    disabled={saving}
                    className="rounded-2xl border border-cyan-500/40 bg-cyan-500/10 px-5 py-3 text-sm font-semibold text-cyan-300 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Save changes"}
                  </button>

                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    disabled={saving}
                    className="rounded-2xl border border-slate-700 bg-slate-950 px-5 py-3 text-sm font-semibold text-slate-300 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="rounded-2xl border border-cyan-500/40 bg-cyan-500/10 px-5 py-3 text-sm font-semibold text-cyan-300 transition hover:bg-cyan-500/20"
                >
                  Edit profile
                </button>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl shadow-black/20">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold text-white">
              Session security
            </h2>

            <p className="mt-1 text-sm text-slate-400">
              Authentication state is active and managed securely by the
              application.
            </p>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">
                Session status
              </p>

              <span className="mt-3 inline-flex rounded-full bg-emerald-500/15 px-3 py-1 text-sm font-semibold text-emerald-300">
                Active
              </span>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-300">
              <span className="font-semibold text-cyan-300">Security note:</span>{" "}
              tokens are intentionally not displayed in the UI to avoid exposing
              sensitive session data.
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}