import type { ReactNode } from "react";
import { Database, Gauge, History, MousePointerClick, Plus, Settings, Table2, Workflow } from "lucide-react";
import { cx } from "../../services/cx.ts";

export interface NavItem {
  id: string;
  label: string;
  icon: ReactNode;
  badge?: number;
}

export const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: <Gauge className="size-4.5" /> },
  { id: "scrapers", label: "Scrapers", icon: <Workflow className="size-4.5" /> },
  { id: "builder", label: "Visual builder", icon: <MousePointerClick className="size-4.5" /> },
  { id: "new", label: "New scraper", icon: <Plus className="size-4.5" /> },
  { id: "results", label: "Results", icon: <Table2 className="size-4.5" /> },
  { id: "history", label: "History", icon: <History className="size-4.5" /> },
  { id: "settings", label: "Settings", icon: <Settings className="size-4.5" /> },
];

export function Sidebar({
  active,
  onNavigate,
  onClose,
  counts,
}: {
  active: string;
  onNavigate: (page: string) => void;
  onClose?: () => void;
  counts?: Partial<Record<string, number>>;
}) {
  return (
    <div className="flex h-full flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="flex h-16 items-center gap-2.5 px-5">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-600 text-white shadow-sm">
          <Database className="size-4.5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">Web Scraper</p>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">Bun · Playwright</p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
        {NAV_ITEMS.map((item) => {
          const isActive = active === item.id;
          const count = counts?.[item.id];
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onNavigate(item.id);
                onClose?.();
              }}
              aria-current={isActive ? "page" : undefined}
              className={cx(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100",
              )}
            >
              <span className={cx("shrink-0", isActive ? "text-brand-600 dark:text-brand-400" : "text-slate-400 dark:text-slate-500")}>
                {item.icon}
              </span>
              <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
              {count ? (
                <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-xs tabular-nums text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-slate-200 px-5 py-4 dark:border-slate-800">
        <p className="text-xs leading-relaxed text-slate-400 dark:text-slate-500">
          Scrape only publicly accessible data, and respect each site's robots.txt and terms of use.
        </p>
      </div>
    </div>
  );
}
