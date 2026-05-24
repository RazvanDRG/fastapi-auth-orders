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

function getUserDisplayName(user: {
  first_name?: string | null;
  last_name?: string | null;
}) {
  return [user.first_name, user.last_name].filter(Boolean).join(" ");
}

function getDeletedSourceLabel(user: DeletedUser) {
  return user.self_deleted ? "self-deleted" : "by admin";
}

function matchesDateRange(
  iso: string | null,
  startDate: string,
  endDate: string
) {
  if (!startDate && !endDate) return true;
  if (!iso) return false;

  const time = new Date(iso).getTime();

  if (Number.isNaN(time)) return false;

  const startTime = startDate ? new Date(startDate).getTime() : null;
  const endTime = endDate ? new Date(endDate).getTime() : null;

  const matchesStart = startTime === null || time >= startTime;
  const matchesEnd = endTime === null || time <= endTime;

  return matchesStart && matchesEnd;
}

export function AdminPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingUserId, setSavingUserId] = useState<number | null>(null);
  const [usersPage, setUsersPage] = useState(1);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [userPendingDelete, setUserPendingDelete] = useState<UserItem | null>(
    null
  );

  const [deletedUsers, setDeletedUsers] = useState<DeletedUser[]>([]);
  const [loadingDeleted, setLoadingDeleted] = useState(false);
  const [deletedPage, setDeletedPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);

  const [activeTab, setActiveTab] = useState<"active" | "deleted">("active");

  const [userSearch, setUserSearch] = useState("");
  const [deletedStartDate, setDeletedStartDate] = useState("");
  const [deletedEndDate, setDeletedEndDate] = useState("");

  const [historySearch, setHistorySearch] = useState("");
  const [historyStartDate, setHistoryStartDate] = useState("");
  const [historyEndDate, setHistoryEndDate] = useState("");

  const sortedUsers = useMemo(() => {
    return [...users]
      .filter((user) => !user.is_deleted)
      .sort((a, b) => a.id - b.id);
  }, [users]);

  const filteredUsers = useMemo(() => {
    const query = userSearch.trim().toLowerCase();

    if (!query) return sortedUsers;

    return sortedUsers.filter((user) => {
      const displayName = getUserDisplayName(user).toLowerCase();

      const searchableText = [
        displayName,
        user.email,
        user.role,
        user.id,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(query);
    });
  }, [sortedUsers, userSearch]);

  const filteredDeletedUsers = useMemo(() => {
    const query = userSearch.trim().toLowerCase();

    return deletedUsers.filter((user) => {
      const displayName = getUserDisplayName(user).toLowerCase();
      const source = getDeletedSourceLabel(user);

      const searchableText = [
        displayName,
        user.email,
        user.role,
        user.id,
        source,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch = !query || searchableText.includes(query);

      return (
        matchesSearch &&
        matchesDateRange(user.deleted_at, deletedStartDate, deletedEndDate)
      );
    });
  }, [deletedUsers, userSearch, deletedStartDate, deletedEndDate]);

  const filteredHistory = useMemo(() => {
    const query = historySearch.trim().toLowerCase();

    return deletedUsers.filter((user) => {
      const displayName = getUserDisplayName(user).toLowerCase();
      const source = getDeletedSourceLabel(user);

      const searchableText = [
        displayName,
        user.email,
        user.role,
        user.id,
        source,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch = !query || searchableText.includes(query);

      return (
        matchesSearch &&
        matchesDateRange(user.deleted_at, historyStartDate, historyEndDate)
      );
    });
  }, [deletedUsers, historySearch, historyStartDate, historyEndDate]);

  const totalUserPages = Math.max(
    1,
    Math.ceil(filteredUsers.length / USERS_PAGE_SIZE)
  );

  const paginatedUsers = filteredUsers.slice(
    (usersPage - 1) * USERS_PAGE_SIZE,
    usersPage * USERS_PAGE_SIZE
  );

  useEffect(() => {
    if (usersPage > totalUserPages) {
      setUsersPage(totalUserPages);
    }
  }, [usersPage, totalUserPages]);

  const totalDeletedPages = Math.max(
    1,
    Math.ceil(filteredDeletedUsers.length / USERS_PAGE_SIZE)
  );

  const paginatedDeletedUsers = filteredDeletedUsers.slice(
    (deletedPage - 1) * USERS_PAGE_SIZE,
    deletedPage * USERS_PAGE_SIZE
  );

  useEffect(() => {
    if (deletedPage > totalDeletedPages) {
      setDeletedPage(totalDeletedPages);
    }
  }, [deletedPage, totalDeletedPages]);

  const totalHistoryPages = Math.max(
    1,
    Math.ceil(filteredHistory.length / USERS_PAGE_SIZE)
  );

  const paginatedHistory = filteredHistory.slice(
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

  function clearUserFilters() {
    setUserSearch("");
    setDeletedStartDate("");
    setDeletedEndDate("");
    setUsersPage(1);
    setDeletedPage(1);
  }

  function clearHistoryFilters() {
    setHistorySearch("");
    setHistoryStartDate("");
    setHistoryEndDate("");
    setHistoryPage(1);
  }


  function escapeCsv(value: string | number | null | undefined) {
    const text = String(value ?? "");
    return `"${text.replace(/"/g, '""')}"`;
  }

  function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number | null | undefined>>) {
    const csv = [headers.map(escapeCsv), ...rows.map((row) => row.map(escapeCsv))]
      .map((row) => row.join(","))
      .join("\n");

    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  }

  function exportUsersCsv() {
    if (activeTab === "active") {
      downloadCsv(
        `active-users-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.csv`,
        ["user_id", "display_name", "email", "role", "is_deleted"],
        filteredUsers.map((user) => [
          user.id,
          getUserDisplayName(user) || "Not provided",
          user.email,
          user.role,
          user.is_deleted ? "yes" : "no",
        ])
      );

      return;
    }

    downloadCsv(
      `deleted-users-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.csv`,
      ["user_id", "display_name", "email", "role", "deleted_at", "source"],
      filteredDeletedUsers.map((user) => [
        user.id,
        getUserDisplayName(user) || "Unnamed user",
        user.email,
        user.role,
        formatDeletedDate(user.deleted_at),
        getDeletedSourceLabel(user),
      ])
    );
  }

  function exportDeletionHistoryCsv() {
    downloadCsv(
      `deletion-history-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.csv`,
      ["user_id", "display_name", "email", "role", "deleted_at", "source"],
      filteredHistory.map((user) => [
        user.id,
        getUserDisplayName(user) || "Unnamed user",
        user.email,
        user.role,
        formatDeletedDate(user.deleted_at),
        getDeletedSourceLabel(user),
      ])
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
        <div className="mb-5 flex flex-col gap-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-white">Users</h2>

              <p className="mt-1 text-sm text-slate-400">
                {activeTab === "active"
                  ? `Showing ${paginatedUsers.length} of ${filteredUsers.length} active accounts.`
                  : `Showing ${paginatedDeletedUsers.length} of ${filteredDeletedUsers.length} deleted accounts.`}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-2xl border border-slate-700 bg-slate-950 p-1">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("active");
                    setUsersPage(1);
                  }}
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
                  onClick={() => {
                    setActiveTab("deleted");
                    setDeletedPage(1);
                  }}
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

          <div className="flex flex-wrap items-center justify-center gap-3">
            <input
              value={userSearch}
              onChange={(e) => {
                setUserSearch(e.target.value);
                setUsersPage(1);
                setDeletedPage(1);
              }}
              placeholder={
                activeTab === "active"
                  ? "Search by name, email, user ID, role"
                  : "Search by name, email, user ID, role, source"
              }
              className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400 xl:w-96"
            />

            {activeTab === "deleted" && (
              <>
                <input
                  type="datetime-local"
                  value={deletedStartDate}
                  onChange={(e) => {
                    setDeletedStartDate(e.target.value);
                    setDeletedPage(1);
                  }}
                  onClick={(e) => e.currentTarget.showPicker?.()}
                  className="w-full cursor-pointer rounded-2xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-white outline-none transition focus:border-cyan-400 xl:w-60"
                />

                <input
                  type="datetime-local"
                  value={deletedEndDate}
                  onChange={(e) => {
                    setDeletedEndDate(e.target.value);
                    setDeletedPage(1);
                  }}
                  onClick={(e) => e.currentTarget.showPicker?.()}
                  className="w-full cursor-pointer rounded-2xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-white outline-none transition focus:border-cyan-400 xl:w-60"
                />
              </>
            )}

            <button
              type="button"
              onClick={exportUsersCsv}
              disabled={
                activeTab === "active"
                  ? filteredUsers.length === 0
                  : filteredDeletedUsers.length === 0
              }
              className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              CSV report
            </button>

            <button
              type="button"
              onClick={clearUserFilters}
              className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:border-rose-500/40 hover:text-rose-300"
            >
              Clear
            </button>
          </div>
        </div>

        {activeTab === "active" ? (
          <>
            {loading ? (
              <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/40 p-6 text-sm text-slate-400">
                Loading users...
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/40 p-6 text-sm text-slate-400">
                No active accounts match your filters.
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  {paginatedUsers.map((user) => {
                    const displayName =
                      getUserDisplayName(user) || "Not provided";

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
                                  {savingUserId === user.id
                                    ? "Saving..."
                                    : "Save changes"}
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

                {filteredUsers.length > USERS_PAGE_SIZE && (
                  <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                    <button
                      type="button"
                      disabled={usersPage === 1}
                      onClick={() =>
                        setUsersPage((prev) => Math.max(1, prev - 1))
                      }
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
            ) : filteredDeletedUsers.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/40 p-6 text-sm text-slate-400">
                No deleted accounts match your filters.
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  {paginatedDeletedUsers.map((deleted) => {
                    const displayName =
                      getUserDisplayName(deleted) || "Unnamed user";

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

                {filteredDeletedUsers.length > USERS_PAGE_SIZE && (
                  <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                    <button
                      type="button"
                      disabled={deletedPage === 1}
                      onClick={() =>
                        setDeletedPage((prev) => Math.max(1, prev - 1))
                      }
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

      <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl shadow-black/20">
        <div className="mb-6 flex flex-col gap-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-white">
                Deletion history
              </h2>

              <p className="mt-1 text-sm text-slate-400">
                {deletedUsers.length === 0
                  ? "No deleted accounts yet."
                  : `${filteredHistory.length} of ${deletedUsers.length} deleted account(s) shown.`}
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

          <div className="flex flex-wrap items-center justify-center gap-3">
            <input
              value={historySearch}
              onChange={(e) => {
                setHistorySearch(e.target.value);
                setHistoryPage(1);
              }}
              placeholder="Search by name, email, user ID, role, source"
              className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400 xl:w-96"
            />

            <input
              type="datetime-local"
              value={historyStartDate}
              onChange={(e) => {
                setHistoryStartDate(e.target.value);
                setHistoryPage(1);
              }}
              onClick={(e) => e.currentTarget.showPicker?.()}
              className="w-full cursor-pointer rounded-2xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-white outline-none transition focus:border-cyan-400 xl:w-60"
            />

            <input
              type="datetime-local"
              value={historyEndDate}
              onChange={(e) => {
                setHistoryEndDate(e.target.value);
                setHistoryPage(1);
              }}
              onClick={(e) => e.currentTarget.showPicker?.()}
              className="w-full cursor-pointer rounded-2xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-white outline-none transition focus:border-cyan-400 xl:w-60"
            />

            <button
              type="button"
              onClick={exportDeletionHistoryCsv}
              disabled={filteredHistory.length === 0}
              className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              CSV report
            </button>

            <button
              type="button"
              onClick={clearHistoryFilters}
              className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:border-rose-500/40 hover:text-rose-300"
            >
              Clear
            </button>
          </div>
        </div>

        {loadingDeleted ? (
          <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/40 p-6 text-sm text-slate-400">
            Loading deletion history...
          </div>
        ) : filteredHistory.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/40 p-6 text-sm text-slate-400">
            No deletion history entries match your filters.
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
                      getUserDisplayName(deleted) || "Unnamed user";

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

            {filteredHistory.length > USERS_PAGE_SIZE && (
              <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  disabled={historyPage === 1}
                  onClick={() =>
                    setHistoryPage((prev) => Math.max(1, prev - 1))
                  }
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
                The account data will remain stored for audit and recovery
                purposes.
              </p>
            </div>

            <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <p className="text-sm font-semibold text-white">
                {getUserDisplayName(userPendingDelete) || "Unnamed user"}
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
