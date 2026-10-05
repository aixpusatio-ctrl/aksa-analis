import type { ReactNode } from "react";
import { AlertCircle, Inbox, Loader2, RefreshCw } from "lucide-react";
import { cx } from "../../services/cx.ts";
import { Button } from "./Button.tsx";

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx("size-4 animate-spin", className)} aria-hidden />;
}

export function LoadingState({ label = "Loading…", className }: { label?: string; className?: string }) {
  return (
    <div className={cx("flex flex-col items-center justify-center gap-3 px-6 py-14 text-center", className)}>
      <Spinner className="size-6 text-brand-500" />
      <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-col items-center justify-center gap-3 px-6 py-14 text-center", className)}>
      <span className="grid size-12 place-items-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
        {icon ?? <Inbox className="size-6" />}
      </span>
      <div className="max-w-sm">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</p>
        {description ? <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
  className,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-col items-center justify-center gap-3 px-6 py-14 text-center", className)}>
      <span className="grid size-12 place-items-center rounded-2xl bg-rose-50 text-rose-500 dark:bg-rose-500/10 dark:text-rose-400">
        <AlertCircle className="size-6" />
      </span>
      <div className="max-w-md">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</p>
        {message ? <p className="mt-1 text-sm break-words text-slate-500 dark:text-slate-400">{message}</p> : null}
      </div>
      {onRetry ? (
        <Button onClick={onRetry} icon={<RefreshCw className="size-4" />}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-md bg-slate-200 dark:bg-slate-800", className)} />;
}
