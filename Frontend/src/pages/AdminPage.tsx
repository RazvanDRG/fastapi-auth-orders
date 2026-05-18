import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

import { http } from "../lib/http";
import { getErrorMessage } from "../lib/utils";

type Role = "admin" | "operator" | "service";

type UserItem = {
  id: number;
  email: string;
  role: Role;
  first_name?: string | null;
  last_name?: string | null;
  is_deleted: boolean;
};

const USERS_PAGE_SIZE = 10;

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

export function AdminPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingUserId, setSavingUserId] = useState<number | null>(null);
  const [usersPage, setUsersPage] = useState(1);

  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => a.id - b.id);
  }, [users]);

  const totalUserPages = Math.max(
    1,
    Math.ceil(sortedUsers.length / USERS_PAGE_SIZE)
  );

  const paginatedUsers = sortedUsers.slice(
    (usersPage - 1) * USERS_PAGE_SIZE,
    usersPage * USERS_PAGE_SIZE
  );

  useEffect(() => {
    if (usersPage > totalUserPages) {
      setUsersPage(totalUserPages);
    }
  }, [usersPage, totalUserPages]);

  async function fetchUsers() {
    try {
      setLoading(true);

      const { data } = await http.get<UserItem[]>("/users");

      setUsers(data);
    } catch (err: unknown) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchUsers();
  }, []);

  async function updateRole(userId: number, role: Role) {
    try {
      setSavingUserId(userId);

      await http.patch(`/users/${userId}/role`, {
        role,
      });

      toast.success("Role updated.");

      await fetchUsers();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err));
    } finally {
      setSavingUserId(null);
    }
  }

  async function updateProfile(
    userId: number,
    firstName: string,
    lastName: string
  ) {
    if (!firstName.trim() || !lastName.trim()) {
      toast.error("First name and last name are required.");
      return;
    }

    try {
      setSavingUserId(userId);

      await http.patch(`/users/${userId}/profile`, {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
      });

      toast.success("Profile updated.");

      await fetchUsers();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err));
    } finally {
      setSavingUserId(null);
    }
  }

  async function deleteUser(userId: number) {
    const confirmed = window.confirm(
      "Are you sure you want to soft delete this user?"
    );

    if (!confirmed) return;

    try {
      setSavingUserId(userId);

      await http.delete(`/users/${userId}`);

      toast.success("User deleted.");

      await fetchUsers();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err));
    } finally {
      setSavingUserId(null);
    }
  }

  function updateLocalUser(userId: number, patch: Partial<UserItem>) {
    setUsers((prev) =>
      prev.map((user) =>
        user.id === userId
          ? {
              ...user,
              ...patch,
            }
          : user
      )
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-bold tracking-tight text-white">
          Admin panel
        </h1>

        <p className="mt-2 text-sm text-slate-400">
          Manage users, roles, profile data, and soft deletion.
        </p>
      </div>

      <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl shadow-black/20">
        <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-white">Users</h2>

            <p className="mt-1 text-sm text-slate-400">
              Showing {paginatedUsers.length} of {sortedUsers.length} users.
            </p>
          </div>

          <button
            type="button"
            onClick={() => fetchUsers()}
            disabled={loading}
            className="inline-flex w-fit rounded-2xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-100 transition hover:border-cyan-400 hover:text-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Refreshing..." : "Refresh users"}
          </button>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/40 p-6 text-sm text-slate-400">
            Loading users...
          </div>
        ) : sortedUsers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/40 p-6 text-sm text-slate-400">
            No users found.
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {paginatedUsers.map((user) => {
                const displayName =
                  [user.first_name, user.last_name].filter(Boolean).join(" ") ||
                  "Not provided";

                return (
                  <div
                    key={user.id}
                    className={`rounded-3xl border p-5 transition ${
                      user.is_deleted
                        ? "border-rose-500/20 bg-rose-500/5"
                        : "border-slate-800 bg-slate-950/40"
                    }`}
                  >
                    <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                      <div className="flex-1 space-y-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-lg font-semibold text-white">
                              {displayName}
                            </p>

                            <p className="mt-1 text-sm text-slate-400">
                              {user.email}
                            </p>

                            <p className="mt-1 text-xs text-slate-500">
                              User ID #{user.id}
                            </p>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-cyan-300">
                              {user.role}
                            </span>

                            {user.is_deleted && (
                              <span className="rounded-full border border-rose-500/20 bg-rose-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-rose-300">
                                Deleted
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                          <div>
                            <label className="mb-2 block text-xs uppercase tracking-wide text-slate-500">
                              First name
                            </label>

                            <input
                              value={user.first_name ?? ""}
                              disabled={user.is_deleted}
                              onChange={(e) =>
                                updateLocalUser(user.id, {
                                  first_name: e.target.value,
                                })
                              }
                              className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
                            />
                          </div>

                          <div>
                            <label className="mb-2 block text-xs uppercase tracking-wide text-slate-500">
                              Last name
                            </label>

                            <input
                              value={user.last_name ?? ""}
                              disabled={user.is_deleted}
                              onChange={(e) =>
                                updateLocalUser(user.id, {
                                  last_name: e.target.value,
                                })
                              }
                              className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="flex min-w-[260px] flex-col gap-3">
                        <div>
                          <label className="mb-2 block text-xs uppercase tracking-wide text-slate-500">
                            Role
                          </label>

                          <select
                            value={user.role}
                            disabled={user.is_deleted}
                            onChange={(e) =>
                              updateLocalUser(user.id, {
                                role: e.target.value as Role,
                              })
                            }
                            className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <option value="admin">admin</option>
                            <option value="operator">operator</option>
                            <option value="service">service</option>
                          </select>
                        </div>

                        <button
                          type="button"
                          disabled={savingUserId === user.id || user.is_deleted}
                          onClick={() =>
                            updateProfile(
                              user.id,
                              user.first_name ?? "",
                              user.last_name ?? ""
                            )
                          }
                          className="rounded-2xl border border-cyan-500/40 bg-cyan-500/10 px-5 py-3 text-sm font-semibold text-cyan-300 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {savingUserId === user.id
                            ? "Saving..."
                            : "Save profile"}
                        </button>

                        <button
                          type="button"
                          disabled={savingUserId === user.id || user.is_deleted}
                          onClick={() => updateRole(user.id, user.role)}
                          className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-5 py-3 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {savingUserId === user.id
                            ? "Saving..."
                            : "Update role"}
                        </button>

                        <button
                          type="button"
                          disabled={savingUserId === user.id || user.is_deleted}
                          onClick={() => deleteUser(user.id)}
                          className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-5 py-3 text-sm font-semibold text-rose-300 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {user.is_deleted ? "Deleted" : "Soft delete user"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {sortedUsers.length > USERS_PAGE_SIZE && (
              <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  disabled={usersPage === 1}
                  onClick={() => setUsersPage((prev) => Math.max(1, prev - 1))}
                  className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-semibold text-slate-300 transition hover:border-cyan-500/40 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ←
                </button>

                {getPaginationItems(usersPage, totalUserPages).map(
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
                        onClick={() => setUsersPage(Number(item))}
                        className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                          usersPage === item
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
                  disabled={usersPage === totalUserPages}
                  onClick={() =>
                    setUsersPage((prev) => Math.min(totalUserPages, prev + 1))
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