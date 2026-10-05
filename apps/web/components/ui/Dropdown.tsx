import { useEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "../../services/cx.ts";

/**
 * Click-to-open menu anchored to its trigger. Closes on outside click, on
 * Escape, and (by default) once an item is chosen.
 */
export function Dropdown({
  trigger,
  children,
  align = "right",
  width = "w-56",
  closeOnSelect = true,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: "left" | "right";
  width?: string;
  closeOnSelect?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div ref={containerRef} className="relative">
      {trigger({ open, toggle: () => setOpen((value) => !value) })}
      {open ? (
        <div
          role="menu"
          onClick={closeOnSelect ? close : undefined}
          className={cx(
            "animate-dialog-in absolute z-40 mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-xl",
            "dark:border-slate-800 dark:bg-slate-900",
            align === "right" ? "right-0" : "left-0",
            width,
          )}
        >
          {typeof children === "function" ? children(close) : children}
        </div>
      ) : null}
    </div>
  );
}

export function DropdownItem({
  onClick,
  icon,
  children,
  destructive = false,
  disabled = false,
}: {
  onClick?: () => void;
  icon?: ReactNode;
  children: ReactNode;
  destructive?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={cx(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-50",
        destructive
          ? "text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
          : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800",
      )}
    >
      {icon ? <span className="shrink-0 text-slate-400 dark:text-slate-500">{icon}</span> : null}
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </button>
  );
}

export function DropdownLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-2.5 pt-2 pb-1 text-xs font-semibold tracking-wide text-slate-400 uppercase dark:text-slate-500">
      {children}
    </p>
  );
}

export function DropdownSeparator() {
  return <div className="my-1 h-px bg-slate-200 dark:bg-slate-800" />;
}
