import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

import { http } from "../lib/http";
import { getRoleBadgeClasses } from "../lib/roles";
import { getErrorMessage } from "../lib/utils";
import type { DeletedUser } from "../types/api";
import { useSSE } from "../hooks/useSSE";


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

function formatDeletedDate(iso: string | null): string {
  if (!iso) return "—";

  try {
    return new Date(iso).toLocaleString("ro-RO", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
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

export function AdminPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingUserId, setSavingUserId] = useState<number | null>(null);
  const [usersPage, setUsersPage] = useState(1);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [userPendingDelete, setUserPendingDelete] = useState<UserItem | null>(null);

  const [deletedUsers, setDeletedUsers] = useState<DeletedUser[]>([]);
  const [loadingDeleted, setLoadingDeleted] = useState(false);
  const [deletedPage, setDeletedPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);

  const [activeTab, setActiveTab] = useState<"active" | "deleted">("active");

  // Only active accounts go in the main list under tab "Active accounts".
  const sortedUsers = useMemo(() => {
    return [...users]
      .filter((user) => !user.is_deleted)
      .sort((a, b) => a.id - b.id);
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

  // Pagination for tab "Deleted accounts" (cards)
  const totalDeletedPages = Math.max(
    1,
    Math.ceil(deletedUsers.length / USERS_PAGE_SIZE)
  );

  const paginatedDeletedUsers = deletedUsers.slice(
    (deletedPage - 1) * USERS_PAGE_SIZE,
    deletedPage * USERS_PAGE_SIZE
  );

  useEffect(() => {
    if (deletedPage > totalDeletedPages) {
      setDeletedPage(totalDeletedPages);
    }
  }, [deletedPage, totalDeletedPages]);

  // Pagination for the deletion history table (audit, always visible at the bottom)
  const totalHistoryPages = Math.max(
    1,
    Math.ceil(deletedUsers.length / USERS_PAGE_SIZE)
  );

  const paginatedHistory = deletedUsers.slice(
    (historyPage - 1) * USERS_PAGE_SIZE,
    historyPage * USERS_PAGE_SIZE
  );

  useEffect(() => {
    if (historyPage > totalHistoryPages) {
      setHistoryPage(totalHistoryPages);
    }
  }, [historyPage, totalHistoryPages]);

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

  async function fetchDeletedUsers() {
    try {
      setLoadingDeleted(true);

      const { data } = await http.get<DeletedUser[]>("/users/deleted");

      setDeletedUsers(data);
    } catch (err: unknown) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoadingDeleted(false);
    }
  }

  useEffect(() => {
    fetchUsers();
    fetchDeletedUsers();
  }, []);

  useSSE((event) => {
    if (event?.type === "user_deleted") {
      // Re-fetch both lists: the user moved from "active" to "deleted".
      fetchUsers();
      fetchDeletedUsers();
    }
  });

  async function saveUserChanges(user: UserItem) {
    if (
      !user.email.trim() ||
      !(user.first_name ?? "").trim() ||
      !(user.last_name ?? "").trim()
    ) {
      toast.error("First name and last name are required.");
      return;
    }

    try {
      setSavingUserId(user.id);

      await http.patch(`/users/${user.id}/profile`, {
        email: user.email.trim(),
        first_name: (user.first_name ?? "").trim(),
        last_name: (user.last_name ?? "").trim(),
      });

      await http.patch(`/users/${user.id}/role`, {
        role: user.role,
      });

      toast.success("User updated.");

      await fetchUsers();

      setEditingUserId(null);
    } catch (err: unknown) {
      toast.error(getErrorMessage(err));
    } finally {
      setSavingUserId(null);
    }
  }

  async function deleteUser(userId: number) {
    try {
      setSavingUserId(userId);

      await http.delete(`/users/${userId}`);

      toast.success("User deleted.");

      await Promise.all([fetchUsers(), fetchDeletedUsers()]);
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

  const isRefreshingCurrentTab =
    activeTab === "active" ? loading : loadingDeleted;

  function refreshCurrentTab() {
    if (activeTab === "active") {
      fetchUsers();
    } else {
      fetchDeletedUsers();
    }
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
              {activeTab === "active"
                ? `Showing ${paginatedUsers.length} of ${sortedUsers.length} active accounts.`
                : `Showing ${paginatedDeletedUsers.length} of ${deletedUsers.length} deleted accounts.`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-2xl border border-slate-700 bg-slate-950 p-1">
              <button
                type="button"
                onClick={() => setActiveTab("active")}
                className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                  activeTab === "active"
                    ? "bg-cyan-400 text-slate-950"
                    : "text-slate-400 hover:text-cyan-200"
                }`}
              >
                Active accounts
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("deleted")}
                className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                  activeTab === "deleted"
                    ? "bg-cyan-400 text-slate-950"
                    : "text-slate-400 hover:text-cyan-200"
                }`}
              >
                Deleted accounts
              </button>
            </div>

            <button
              type="button"
              onClick={refreshCurrentTab}
              disabled={isRefreshingCurrentTab}
              className="inline-flex w-fit rounded-2xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-100 transition hover:border-cyan-400 hover:text-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isRefreshingCurrentTab ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>

        {activeTab === "active" ? (
          <>
            {loading ? (
              <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/40 p-6 text-sm text-slate-400">
                Loading users...
              </div>
            ) : sortedUsers.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/40 p-6 text-sm text-slate-400">
                No active accounts.
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  {paginatedUsers.map((user) => {
                    const displayName =
                      [user.first_name, user.last_name].filter(Boolean).join(" ") ||
                      "Not provided";

                    const isEditing = editingUserId === user.id;

                    return (
                      <div
                        key={user.id}
                        className="rounded-3xl border border-slate-800 bg-slate-950/40 p-5 transition"
                      >
                        <div className="flex flex-col gap-5">
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
                              <span
                                className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${getRoleBadgeClasses(
                                  user.role
                                )}`}
                              >
                                {user.role}
                              </span>
                            </div>
                          </div>

                          {isEditing ? (
                            <div className="space-y-4">
                              <div className="grid gap-4 md:grid-cols-3">
                                <div>
                                  <label className="mb-2 block text-xs uppercase tracking-wide text-slate-500">
                                    Email
                                  </label>

                                  <input
                                    type="email"
                                    value={user.email}
                                    onChange={(e) =>
                                      updateLocalUser(user.id, {
                                        email: e.target.value,
                                      })
                                    }
                                    className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400"
                                  />
                                </div>

                                <div>
                                  <label className="mb-2 block text-xs uppercase tracking-wide text-slate-500">
                                    First name
                                  </label>

                                  <input
                                    value={user.first_name ?? ""}
                                    onChange={(e) =>
                                      updateLocalUser(user.id, {
                                        first_name: e.target.value,
                                      })
                                    }
                                    className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400"
                                  />
                                </div>

                                <div>
                                  <label className="mb-2 block text-xs uppercase tracking-wide text-slate-500">
                                    Last name
                                  </label>

                                  <input
                                    value={user.last_name ?? ""}
                                    onChange={(e) =>
                                      updateLocalUser(user.id, {
                                        last_name: e.target.value,
                                      })
                                    }
                                    className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400"
                                  />
                                </div>
                              </div>

                              <div>
                                <label className="mb-2 block text-xs uppercase tracking-wide text-slate-500">
                                  Role
                                </label>

                                <select
                                  value={user.role}
                                  onChange={(e) =>
                                    updateLocalUser(user.id, {
                                      role: e.target.value as Role,
                                    })
                                  }
                                  className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
                                >
                                  <option value="admin">admin</option>
                                  <option value="operator">operator</option>
                                  <option value="service">service</option>
                                </select>
                              </div>

                              <div className="flex flex-wrap gap-3">
                                <button
                                  type="button"
                                  disabled={savingUserId === user.id}
                                  onClick={() => saveUserChanges(user)}
                                  className="rounded-2xl border border-cyan-500/40 bg-cyan-500/10 px-5 py-3 text-sm font-semibold text-cyan-300 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {savingUserId === user.id ? "Saving..." : "Save changes"}
                                </button>

                                <button
                                  type="button"
                                  disabled={savingUserId === user.id}
                                  onClick={() => setUserPendingDelete(user)}
                                  className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-5 py-3 text-sm font-semibold text-rose-300 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  Soft delete user
                                </button>

                                <button
                                  type="button"
                                  onClick={() => setEditingUserId(null)}
                                  className="rounded-2xl border border-slate-700 bg-slate-900 px-5 py-3 text-sm font-semibold text-slate-300 transition hover:border-slate-500 hover:text-white"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-wrap items-center justify-between gap-4">
                              <p className="text-sm text-slate-400">
                                Role management and profile editing available.
                              </p>

                              <button
                                type="button"
                                onClick={() => setEditingUserId(user.id)}
                                className="rounded-2xl border border-cyan-500/40 bg-cyan-500/10 px-5 py-3 text-sm font-semibold text-cyan-300 transition hover:bg-cyan-500/20"
                              >
                                Modify
                              </button>
                            </div>
                          )}
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
                            key={`ellipsis-active-${index}`}
                            className="px-2 text-slate-500"
                          >
                            ...
                          </span>
                        ) : (
                          <button
                            key={`active-${item}`}
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
                        setUsersPage((prev) =>
                          Math.min(totalUserPages, prev + 1)
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
          </>
        ) : (
          <>
            {loadingDeleted ? (
              <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/40 p-6 text-sm text-slate-400">
                Loading deleted accounts...
              </div>
            ) : deletedUsers.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/40 p-6 text-sm text-slate-400">
                No accounts have been deleted yet.
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  {paginatedDeletedUsers.map((deleted) => {
                    const displayName =
                      [deleted.first_name, deleted.last_name]
                        .filter(Boolean)
                        .join(" ") || "Unnamed user";

                    return (
                      <div
                        key={deleted.id}
                        className="rounded-3xl border border-rose-500/20 bg-rose-500/5 p-5 transition"
                      >
                        <div className="flex flex-col gap-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-lg font-semibold text-white">
                                {displayName}
                              </p>

                              <p className="mt-1 text-sm text-slate-400">
                                {deleted.email}
                              </p>

                              <p className="mt-1 text-xs text-slate-500">
                                User ID #{deleted.id}
                              </p>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <span
                                className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${getRoleBadgeClasses(
                                  deleted.role
                                )}`}
                              >
                                {deleted.role}
                              </span>

                              {deleted.self_deleted ? (
                                <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-300">
                                  Self-deleted
                                </span>
                              ) : (
                                <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                                  By admin
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-400">
                            <span>
                              <span className="text-slate-500">Deleted at: </span>
                              <span className="text-slate-200">
                                {formatDeletedDate(deleted.deleted_at)}
                              </span>
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {deletedUsers.length > USERS_PAGE_SIZE && (
                  <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                    <button
                      type="button"
                      disabled={deletedPage === 1}
                      onClick={() => setDeletedPage((prev) => Math.max(1, prev - 1))}
                      className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-semibold text-slate-300 transition hover:border-cyan-500/40 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      ←
                    </button>

                    {getPaginationItems(deletedPage, totalDeletedPages).map(
                      (item, index) =>
                        item === "..." ? (
                          <span
                            key={`ellipsis-deleted-${index}`}
                            className="px-2 text-slate-500"
                          >
                            ...
                          </span>
                        ) : (
                          <button
                            key={`deleted-${item}`}
                            type="button"
                            onClick={() => setDeletedPage(Number(item))}
                            className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                              deletedPage === item
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
                      disabled={deletedPage === totalDeletedPages}
                      onClick={() =>
                        setDeletedPage((prev) =>
                          Math.min(totalDeletedPages, prev + 1)
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
          </>
        )}
      </section>

      {/* Deletion history - always visible at the bottom for audit purposes */}
      <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl shadow-black/20">
        <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-white">
              Deletion history
            </h2>

            <p className="mt-1 text-sm text-slate-400">
              {deletedUsers.length === 0
                ? "No deleted accounts yet."
                : `${deletedUsers.length} account(s) marked as deleted.`}
            </p>
          </div>

          <button
            type="button"
            onClick={() => fetchDeletedUsers()}
            disabled={loadingDeleted}
            className="inline-flex w-fit rounded-2xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-100 transition hover:border-cyan-400 hover:text-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loadingDeleted ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {loadingDeleted ? (
          <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/40 p-6 text-sm text-slate-400">
            Loading deletion history...
          </div>
        ) : deletedUsers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/40 p-6 text-sm text-slate-400">
            No accounts have been deleted yet.
          </div>
        ) : (
          <>
            <div className="overflow-hidden rounded-2xl border border-slate-800">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-900/60 text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Deleted at</th>
                    <th className="px-4 py-3">Source</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-800">
                  {paginatedHistory.map((deleted) => {
                    const displayName =
                      [deleted.first_name, deleted.last_name]
                        .filter(Boolean)
                        .join(" ") || "Unnamed user";

                    return (
                      <tr key={deleted.id} className="bg-slate-950/20">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-white">
                            {displayName}
                          </p>

                          <p className="text-xs text-slate-500">
                            User ID #{deleted.id}
                          </p>
                        </td>

                        <td className="break-all px-4 py-3 text-slate-300">
                          {deleted.email}
                        </td>

                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${getRoleBadgeClasses(
                              deleted.role
                            )}`}
                          >
                            {deleted.role}
                          </span>
                        </td>

                        <td className="px-4 py-3 text-slate-300">
                          {formatDeletedDate(deleted.deleted_at)}
                        </td>

                        <td className="px-4 py-3">
                          {deleted.self_deleted ? (
                            <span className="inline-flex rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-300">
                              Self-deleted
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                              By admin
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {deletedUsers.length > USERS_PAGE_SIZE && (
              <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  disabled={historyPage === 1}
                  onClick={() => setHistoryPage((prev) => Math.max(1, prev - 1))}
                  className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-semibold text-slate-300 transition hover:border-cyan-500/40 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ←
                </button>

                {getPaginationItems(historyPage, totalHistoryPages).map(
                  (item, index) =>
                    item === "..." ? (
                      <span
                        key={`ellipsis-history-${index}`}
                        className="px-2 text-slate-500"
                      >
                        ...
                      </span>
                    ) : (
                      <button
                        key={`history-${item}`}
                        type="button"
                        onClick={() => setHistoryPage(Number(item))}
                        className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                          historyPage === item
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
                  disabled={historyPage === totalHistoryPages}
                  onClick={() =>
                    setHistoryPage((prev) =>
                      Math.min(totalHistoryPages, prev + 1)
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

      {userPendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-950 p-6 shadow-2xl">
            <div>
              <h3 className="text-2xl font-semibold text-white">
                Confirm soft delete
              </h3>

              <p className="mt-3 text-sm leading-relaxed text-slate-400">
                This user will be deactivated and hidden from active operations.
                The account data will remain stored for audit and recovery purposes.
              </p>
            </div>

            <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <p className="text-sm font-semibold text-white">
                {[
                  userPendingDelete.first_name,
                  userPendingDelete.last_name,
                ]
                  .filter(Boolean)
                  .join(" ") || "Unnamed user"}
              </p>

              <p className="mt-1 text-sm text-slate-400">
                {userPendingDelete.email}
              </p>

              <p className="mt-2 text-xs text-slate-500">
                User ID #{userPendingDelete.id}
              </p>
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => setUserPendingDelete(null)}
                className="rounded-2xl border border-slate-700 bg-slate-900 px-5 py-3 text-sm font-semibold text-slate-300 transition hover:border-slate-500 hover:text-white"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={savingUserId === userPendingDelete.id}
                onClick={async () => {
                  await deleteUser(userPendingDelete.id);

                  setUserPendingDelete(null);
                  setEditingUserId(null);
                }}
                className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-5 py-3 text-sm font-semibold text-rose-300 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingUserId === userPendingDelete.id
                  ? "Deleting..."
                  : "Soft delete user"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
