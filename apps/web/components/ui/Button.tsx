import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cx } from "../../services/cx.ts";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";
type Size = "sm" | "md" | "lg" | "icon";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-brand-600 text-white shadow-sm hover:bg-brand-700 active:bg-brand-800 disabled:bg-brand-300 dark:disabled:bg-brand-900",
  secondary:
    "border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-50 active:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800",
  ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100",
  danger: "bg-rose-600 text-white shadow-sm hover:bg-rose-700 active:bg-rose-800 disabled:bg-rose-300 dark:disabled:bg-rose-900",
  success: "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 active:bg-emerald-800 disabled:bg-emerald-300",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 gap-1.5 px-2.5 text-xs",
  md: "h-9.5 gap-2 px-3.5 text-sm",
  lg: "h-11 gap-2 px-5 text-sm",
  icon: "h-9 w-9 justify-center",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  icon,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cx(
        "inline-flex shrink-0 items-center rounded-lg font-medium transition-colors select-none",
        "disabled:cursor-not-allowed disabled:opacity-70",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}
