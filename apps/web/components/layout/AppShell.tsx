import { useEffect, useState, type ReactNode } from "react";
import type { ThemeMode } from "@shared/types.ts";
import { Sidebar } from "./Sidebar.tsx";
import { Topbar } from "./Topbar.tsx";

export function AppShell({
  page,
  onNavigate,
  title,
  subtitle,
  actions,
  theme,
  onThemeChange,
  counts,
  children,
}: {
  page: string;
  onNavigate: (page: string) => void;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  theme: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
  counts?: Partial<Record<string, number>>;
  children: ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  // The mobile drawer should never survive a route change.
  useEffect(() => setDrawerOpen(false), [page]);

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
      <aside className="hidden w-64 shrink-0 lg:block">
        <div className="fixed inset-y-0 left-0 w-64">
          <Sidebar active={page} onNavigate={onNavigate} counts={counts} />
        </div>
      </aside>

      {drawerOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="animate-overlay-in absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 shadow-2xl">
            <Sidebar active={page} onNavigate={onNavigate} onClose={() => setDrawerOpen(false)} counts={counts} />
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          title={title}
          subtitle={subtitle}
          actions={actions}
          theme={theme}
          onThemeChange={onThemeChange}
          onOpenSidebar={() => setDrawerOpen(true)}
        />
        <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
