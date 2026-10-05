import type { ReactNode } from "react";
import { cx } from "../../services/cx.ts";

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cx("card", className)}>{children}</section>;
}

export function CardHeader({
  title,
  description,
  actions,
  icon,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
      <div className="flex min-w-0 items-start gap-3">
        {icon ? (
          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300">
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
          {description ? <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx("px-5 py-4", className)}>{children}</div>;
}

export function CardFooter({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <footer
      className={cx(
        "flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-800",
        className,
      )}
    >
      {children}
    </footer>
  );
}
