import type { ReactNode } from "react";
import type { RunStatus } from "@shared/types.ts";
import { cx } from "../../services/cx.ts";

type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";

const TONES: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700",
  brand: "bg-brand-50 text-brand-700 ring-brand-200 dark:bg-brand-500/10 dark:text-brand-300 dark:ring-brand-500/25",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/25",
  warning: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/25",
  danger: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/25",
  info: "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/25",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const STATUS_TONE: Record<RunStatus, Tone> = {
  queued: "neutral",
  running: "info",
  completed: "success",
  stopped: "warning",
  failed: "danger",
};

const STATUS_LABEL: Record<RunStatus, string> = {
  queued: "Queued",
  running: "Running",
  completed: "Completed",
  stopped: "Stopped",
  failed: "Failed",
};

export function StatusBadge({ status }: { status: RunStatus }) {
  return (
    <Badge tone={STATUS_TONE[status]}>
      <span
        className={cx(
          "size-1.5 rounded-full bg-current",
          status === "running" && "animate-pulse",
        )}
        aria-hidden
      />
      {STATUS_LABEL[status]}
    </Badge>
  );
}
