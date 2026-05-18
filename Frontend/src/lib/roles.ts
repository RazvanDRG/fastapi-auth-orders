export type Role = "admin" | "operator" | "service";

export function getRoleBadgeClasses(role?: string | null) {
  switch (role) {
    case "admin":
      return "border-rose-500/30 bg-rose-500/15 text-rose-300";

    case "operator":
      return "border-emerald-500/30 bg-emerald-500/15 text-emerald-300";

    case "service":
      return "border-amber-500/30 bg-amber-500/15 text-amber-300";

    default:
      return "border-slate-500/30 bg-slate-500/15 text-slate-300";
  }
}