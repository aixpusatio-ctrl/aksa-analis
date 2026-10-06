import { useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { AppShell } from "./components/layout/AppShell.tsx";
import { ToastProvider } from "./hooks/useToast.tsx";
import { useRouter } from "./hooks/useRouter.ts";
import { useTheme } from "./hooks/useTheme.ts";
import { DashboardPage } from "./pages/DashboardPage.tsx";
import { ScrapersPage } from "./pages/ScrapersPage.tsx";
import { ScraperEditorPage } from "./pages/ScraperEditorPage.tsx";
import { VisualBuilderPage } from "./pages/VisualBuilderPage.tsx";
import { ResultsPage } from "./pages/ResultsPage.tsx";
import { HistoryPage } from "./pages/HistoryPage.tsx";
import { SettingsPage } from "./pages/SettingsPage.tsx";

const TITLES: Record<string, { title: string; subtitle: string }> = {
  dashboard: { title: "Dashboard", subtitle: "Start a scrape and watch it run" },
  scrapers: { title: "Scrapers", subtitle: "Saved scraping configurations" },
  builder: { title: "Visual builder", subtitle: "Open a page and click what you want to extract" },
  new: { title: "New scraper", subtitle: "Describe what to extract and how to paginate" },
  results: { title: "Results", subtitle: "Browse, filter and export scraped data" },
  history: { title: "History", subtitle: "Every run, with its results kept" },
  settings: { title: "Settings", subtitle: "Defaults, appearance and diagnostics" },
};

export function App() {
  return (
    <ToastProvider>
      <Router />
    </ToastProvider>
  );
}

function Router() {
  const { page, params, navigate } = useRouter();
  const { theme, setTheme } = useTheme();

  // Make `#/` resolve to the dashboard rather than an empty shell.
  useEffect(() => {
    if (!window.location.hash) navigate("dashboard");
  }, [navigate]);

  const { element, navKey } = useMemo((): { element: ReactNode; navKey: string } => {
    switch (page) {
      case "scrapers":
        return params[0]
          ? { element: <ScraperEditorPage scraperId={params[0]} navigate={navigate} />, navKey: "scrapers" }
          : { element: <ScrapersPage navigate={navigate} />, navKey: "scrapers" };
      case "builder":
        return { element: <VisualBuilderPage navigate={navigate} />, navKey: "builder" };
      case "new":
        return { element: <ScraperEditorPage navigate={navigate} />, navKey: "new" };
      case "results":
        return { element: <ResultsPage runId={params[0]} navigate={navigate} />, navKey: "results" };
      case "history":
        return { element: <HistoryPage navigate={navigate} />, navKey: "history" };
      case "settings":
        return { element: <SettingsPage theme={theme} onThemeChange={setTheme} />, navKey: "settings" };
      default:
        return { element: <DashboardPage navigate={navigate} />, navKey: "dashboard" };
    }
  }, [page, params, navigate, theme, setTheme]);

  const heading = TITLES[navKey] ?? TITLES.dashboard!;
  const isEditing = navKey === "scrapers" && params[0];

  return (
    <AppShell
      page={navKey}
      onNavigate={navigate}
      title={isEditing ? "Edit scraper" : heading.title}
      subtitle={isEditing ? "Change the configuration, then save or run it" : heading.subtitle}
      theme={theme}
      onThemeChange={setTheme}
    >
      {element}
    </AppShell>
  );
}
