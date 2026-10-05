import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cx } from "../../services/cx.ts";

export function Label({ htmlFor, children, hint }: { htmlFor?: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="field-label flex items-baseline justify-between gap-2">
      <span>{children}</span>
      {hint ? <span className="text-xs font-normal text-slate-400 dark:text-slate-500">{hint}</span> : null}
    </label>
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx("input-base", className)} {...rest} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx("input-base resize-y", className)} {...rest} />;
}

export function Select({
  className,
  options,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[] }) {
  return (
    <select className={cx("input-base cursor-pointer appearance-none bg-no-repeat pr-9", className)} {...rest}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%2394a3b8' stroke-width='1.6'%3E%3Cpath d='M4 6l4 4 4-4'/%3E%3C/svg%3E\")",
        backgroundPosition: "right 0.65rem center",
        backgroundSize: "1rem",
      }}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function FormRow({
  label,
  hint,
  help,
  htmlFor,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  help?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor} hint={hint}>
        {label}
      </Label>
      {children}
      {help ? <p className="field-hint">{help}</p> : null}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label
      className={cx(
        "flex cursor-pointer items-start gap-3 select-none",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          "relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors",
          checked ? "bg-brand-600" : "bg-slate-300 dark:bg-slate-700",
        )}
      >
        <span
          className={cx(
            "absolute top-0.5 size-4 rounded-full bg-white shadow transition-all",
            checked ? "left-4.5" : "left-0.5",
          )}
        />
      </button>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-800 dark:text-slate-200">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{description}</span>
        ) : null}
      </span>
    </label>
  );
}
