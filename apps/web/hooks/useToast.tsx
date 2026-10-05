import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cx } from "../services/cx.ts";

type ToastTone = "success" | "error" | "warning" | "info";

interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
}

interface ToastApi {
  show: (toast: Omit<Toast, "id">) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const ICONS: Record<ToastTone, ReactNode> = {
  success: <CheckCircle2 className="size-4.5 text-emerald-500" />,
  error: <XCircle className="size-4.5 text-rose-500" />,
  warning: <AlertTriangle className="size-4.5 text-amber-500" />,
  info: <Info className="size-4.5 text-sky-500" />,
};

const DURATION: Record<ToastTone, number> = {
  success: 3500,
  info: 3500,
  warning: 5000,
  error: 7000,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    (toast: Omit<Toast, "id">) => {
      const id = nextId.current++;
      // Cap the stack so a burst of errors cannot cover the whole screen.
      setToasts((current) => [...current.slice(-4), { ...toast, id }]);
      setTimeout(() => dismiss(id), DURATION[toast.tone]);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (title, description) => show({ tone: "success", title, ...(description ? { description } : {}) }),
      error: (title, description) => show({ tone: "error", title, ...(description ? { description } : {}) }),
      warning: (title, description) => show({ tone: "warning", title, ...(description ? { description } : {}) }),
      info: (title, description) => show({ tone: "info", title, ...(description ? { description } : {}) }),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cx(
              "animate-toast-in pointer-events-auto flex items-start gap-3 rounded-xl border bg-white p-3.5 shadow-lg",
              "border-slate-200 dark:border-slate-800 dark:bg-slate-900",
            )}
          >
            <span className="mt-0.5 shrink-0">{ICONS[toast.tone]}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{toast.title}</p>
              {toast.description ? (
                <p className="mt-0.5 text-xs break-words text-slate-500 dark:text-slate-400">{toast.description}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss notification"
              className="shrink-0 rounded-md p-0.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside <ToastProvider>");
  return context;
}
