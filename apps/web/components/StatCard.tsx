import type { ReactNode } from "react";
import { cx } from "../services/cx.ts";
import { Skeleton } from "./ui/States.tsx";

export function StatCard({
  label,
  value,
  icon,
  tone = "brand",
  hint,
  loading = false,
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  tone?: "brand" | "success" | "warning" | "danger" | "neutral";
  hint?: ReactNode;
  loading?: boolean;
}) {
  const tones = {
    brand: "bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300",
    success: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300",
    warning: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300",
    danger: "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300",
    neutral: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  };

  return (
    <div className="card flex items-center gap-4 px-5 py-4">
      <span className={cx("grid size-11 shrink-0 place-items-center rounded-xl", tones[tone])}>{icon}</span>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">{label}</p>
        {loading ? (
          <Skeleton className="mt-1.5 h-6 w-16" />
        ) : (
          <p className="mt-0.5 truncate text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">{value}</p>
        )}
        {hint ? <p className="mt-0.5 truncate text-xs text-slate-400 dark:text-slate-500">{hint}</p> : null}
      </div>
    </div>
  );
}
