import { NavLink, Outlet } from "react-router-dom";
import {
  LayoutDashboard,
  Package,
  Boxes,
  User,
  LogOut,
  Shield,
} from "lucide-react";

import { useAuth } from "../../context/AuthContext";
import { getRoleBadgeClasses } from "../../lib/roles";

export function AppShell() {
  const { user, logout } = useAuth();

  const navItems = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    ...(user?.role !== "service"
      ? [{ to: "/orders", label: "Orders", icon: Package }]
      : []),
    { to: "/profile", label: "Profile", icon: User },

    ...(user?.role === "admin"
      ? [
          {
            to: "/admin",
            label: "Admin",
            icon: Shield,
          },
        ]
      : []),

    ...(user?.role === "admin" || user?.role === "service"
      ? [
          {
            to: "/inventory",
            label: "Inventory",
            icon: Boxes,
          },
        ]
      : []),
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="flex min-h-screen">
        <aside className="sticky top-0 flex h-screen w-[270px] shrink-0 flex-col overflow-y-auto border-r border-slate-800 bg-slate-950/90 px-4 py-6">
          <div className="mb-8 flex items-center gap-4 px-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-400 text-lg font-bold text-slate-950">
              wo
            </div>

            <div>
              <h1 className="text-2xl font-bold text-white">
                Warehouse Ops
              </h1>

              <p className="text-sm text-slate-400">
                Interview Console
              </p>
            </div>
          </div>

          <nav className="space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon;

              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition ${
                      isActive
                        ? "border border-slate-700 bg-slate-900 text-white"
                        : "text-slate-400 hover:bg-slate-900/60 hover:text-white"
                    }`
                  }
                >
                  <Icon size={18} />

                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </nav>

          <div className="mt-6 space-y-4">
            <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-4">
              <p className="break-all text-base font-semibold text-white">
                {user?.email || "User"}
              </p>

              <p className="mt-2 break-all text-sm text-slate-400">
                {user?.email || "No email"}
              </p>

              <div
                className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${getRoleBadgeClasses(
                  user?.role
                )}`}
              >
                {user?.role || "operator"}
              </div>
            </div>

            <button
              type="button"
              onClick={logout}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-semibold text-slate-100 transition hover:border-rose-400/40 hover:text-rose-300"
            >
              <LogOut size={16} />

              <span>Sign out</span>
            </button>
          </div>

          <div className="flex-1" />
        </aside>

        <main className="flex-1 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.08),_transparent_35%),linear-gradient(180deg,_#020617_0%,_#020b1f_100%)] px-8 py-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}