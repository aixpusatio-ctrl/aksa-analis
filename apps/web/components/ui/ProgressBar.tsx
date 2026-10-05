import { cx } from "../../services/cx.ts";

/**
 * Determinate when `value` is a number, indeterminate when it is null — which
 * is the case for pagination modes where the page count is unknown up front.
 */
export function ProgressBar({
  value,
  tone = "brand",
  className,
  label,
}: {
  value: number | null;
  tone?: "brand" | "success" | "danger" | "warning";
  className?: string;
  label?: string;
}) {
  const tones = {
    brand: "bg-brand-600",
    success: "bg-emerald-500",
    danger: "bg-rose-500",
    warning: "bg-amber-500",
  };

  return (
    <div
      role="progressbar"
      aria-valuenow={value ?? undefined}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? "Progress"}
      className={cx("relative h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800", className)}
    >
      {value === null ? (
        <div className={cx("animate-indeterminate absolute inset-y-0 w-1/4 rounded-full", tones[tone])} />
      ) : (
        <div
          className={cx("h-full rounded-full transition-[width] duration-500 ease-out", tones[tone])}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      )}
    </div>
  );
}
