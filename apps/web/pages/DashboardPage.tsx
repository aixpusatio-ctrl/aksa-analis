import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Database, FileStack, Play, Plus, Rocket, Table2, Workflow } from "lucide-react";
import type { Run, Scraper } from "@shared/types.ts";
import { api, ApiError } from "../services/api.ts";
import { useAsync } from "../hooks/useAsync.ts";
import { useRunStream } from "../hooks/useRunStream.ts";
import { useToast } from "../hooks/useToast.tsx";
import { Button } from "../components/ui/Button.tsx";
import { Card, CardBody, CardHeader } from "../components/ui/Card.tsx";
import { FormRow, Input, Select } from "../components/ui/Field.tsx";
import { EmptyState, ErrorState, LoadingState } from "../components/ui/States.tsx";
import { StatCard } from "../components/StatCard.tsx";
import { RunMonitor } from "../components/RunMonitor.tsx";
import { StatusBadge } from "../components/ui/Badge.tsx";

/**
 * The control room: start a saved scraper, watch it run, and see the numbers
 * across every run so far.
 */
export function DashboardPage({ navigate }: { navigate: (to: string) => void }) {
  const toast = useToast();
  const [activeRun, setActiveRun] = useState<Run | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [quickUrl, setQuickUrl] = useState("");
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  const scrapers = useAsync<Scraper[]>(() => api.listScrapers(), []);
  const stats = useAsync(() => api.stats(), [refreshToken]);
  const stream = useRunStream(activeRun?.id ?? null);

  // Reattach to whatever is already running after a page reload.
  useEffect(() => {
    void (async () => {
      try {
        const history = await api.history({ pageSize: 5 });
        const live = history.items.find((run) => run.status === "running" || run.status === "queued");
        if (live) setActiveRun(live);
      } catch {
        /* the dashboard still works without a live run */
      }
    })();
  }, []);

  useEffect(() => {
    if (scrapers.data && scrapers.data.length > 0 && !selectedId) {
      setSelectedId(scrapers.data[0]!.id);
    }
  }, [scrapers.data, selectedId]);

  const status = stream.progress?.status ?? activeRun?.status;
  const isRunning = status === "running" || status === "queued";

  // Refresh the aggregate cards once a run reaches a terminal state.
  useEffect(() => {
    if (status && !isRunning) setRefreshToken((value) => value + 1);
  }, [status, isRunning]);

  const selectedScraper = useMemo(
    () => scrapers.data?.find((scraper) => scraper.id === selectedId) ?? null,
    [scrapers.data, selectedId],
  );

  const start = useCallback(async () => {
    if (!selectedScraper) return;
    setStarting(true);
    try {
      const { run } = await api.startScraper(selectedScraper.id);
      setActiveRun(run);
      toast.success("Scraping started", run.url);
    } catch (error) {
      toast.error("Could not start the scraper", error instanceof ApiError ? error.message : String(error));
    } finally {
      setStarting(false);
    }
  }, [selectedScraper, toast]);

  const quickStart = useCallback(async () => {
    const url = quickUrl.trim();
    if (!url) return;
    setStarting(true);
    try {
      // A URL with no field configuration still yields something useful: the
      // page title and every link on the page.
      const { run } = await api.scrapeNow({
        name: `Quick scrape — ${url}`,
        url,
        itemSelector: "",
        fields: [
          { id: "t", name: "page_title", selector: "title", selectorKind: "css", type: "text", trim: true },
          { id: "h", name: "headings", selector: "h1, h2", selectorKind: "css", type: "text", multiple: true, trim: true },
          { id: "l", name: "links", selector: "a[href]", selectorKind: "css", type: "link", multiple: true, trim: true },
        ],
        pagination: { mode: "none" },
      });
      setActiveRun(run);
      toast.info("Quick scrape started", "Page title, headings and links");
    } catch (error) {
      toast.error("Could not start the scrape", error instanceof ApiError ? error.message : String(error));
    } finally {
      setStarting(false);
    }
  }, [quickUrl, toast]);

  const stop = useCallback(async () => {
    if (!activeRun) return;
    setStopping(true);
    try {
      await api.stopRun(activeRun.id);
      toast.warning("Stop requested", "The run finishes its current page first.");
    } catch (error) {
      toast.error("Could not stop the run", error instanceof ApiError ? error.message : String(error));
    } finally {
      setStopping(false);
    }
  }, [activeRun, toast]);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Items collected"
          value={(stats.data?.totalItems ?? 0).toLocaleString()}
          icon={<FileStack className="size-5" />}
          loading={stats.loading}
          hint="across all runs"
        />
        <StatCard
          label="Total runs"
          value={(stats.data?.totalRuns ?? 0).toLocaleString()}
          icon={<Rocket className="size-5" />}
          tone="neutral"
          loading={stats.loading}
        />
        <StatCard
          label="Saved scrapers"
          value={(stats.data?.savedScrapers ?? 0).toLocaleString()}
          icon={<Workflow className="size-5" />}
          tone="success"
          loading={stats.loading}
        />
        <StatCard
          label="Failed runs"
          value={(stats.data?.failedRuns ?? 0).toLocaleString()}
          icon={<AlertTriangle className="size-5" />}
          tone={stats.data?.failedRuns ? "danger" : "neutral"}
          loading={stats.loading}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[22rem_1fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader icon={<Play className="size-4.5" />} title="Start a run" description="Pick a saved scraper." />
            <CardBody className="space-y-4">
              {scrapers.loading ? (
                <LoadingState label="Loading scrapers…" className="py-8" />
              ) : scrapers.error ? (
                <ErrorState message={scrapers.error} onRetry={scrapers.reload} className="py-8" />
              ) : scrapers.data && scrapers.data.length > 0 ? (
                <>
                  <FormRow label="Scraper" htmlFor="dashboard-scraper">
                    <Select
                      id="dashboard-scraper"
                      value={selectedId}
                      onChange={(event) => setSelectedId(event.target.value)}
                      options={scrapers.data.map((scraper) => ({ value: scraper.id, label: scraper.name }))}
                      disabled={isRunning}
                    />
                  </FormRow>

                  {selectedScraper ? (
                    <dl className="space-y-1.5 rounded-lg bg-slate-50 px-3 py-2.5 text-xs dark:bg-slate-950/40">
                      <Row label="URL" value={selectedScraper.url} mono />
                      <Row label="Item selector" value={selectedScraper.itemSelector || "whole page"} mono />
                      <Row label="Fields" value={selectedScraper.fields.map((field) => field.name).join(", ")} />
                      <Row label="Pagination" value={selectedScraper.pagination.mode} />
                      <Row label="Max pages" value={String(selectedScraper.maxPages)} />
                    </dl>
                  ) : null}

                  <div className="flex gap-2">
                    <Button
                      variant="primary"
                      className="flex-1"
                      onClick={() => void start()}
                      loading={starting}
                      disabled={isRunning || !selectedScraper}
                      icon={<Play className="size-4" />}
                    >
                      Start scraping
                    </Button>
                    <Button onClick={() => navigate(`scrapers/${selectedId}`)} disabled={!selectedScraper}>
                      Edit
                    </Button>
                  </div>
                </>
              ) : (
                <EmptyState
                  icon={<Workflow className="size-6" />}
                  title="No scrapers yet"
                  description="Create one to describe what to extract."
                  action={
                    <Button variant="primary" size="sm" onClick={() => navigate("new")} icon={<Plus className="size-4" />}>
                      New scraper
                    </Button>
                  }
                  className="py-8"
                />
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              icon={<Database className="size-4.5" />}
              title="Quick scrape"
              description="Grab a page's title, headings and links without saving a config."
            />
            <CardBody className="space-y-3">
              <Input
                value={quickUrl}
                onChange={(event) => setQuickUrl(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void quickStart();
                }}
                placeholder="https://example.com"
                inputMode="url"
                disabled={isRunning}
                aria-label="URL to quick scrape"
              />
              <Button
                className="w-full"
                onClick={() => void quickStart()}
                loading={starting}
                disabled={isRunning || !quickUrl.trim()}
              >
                Scrape this page
              </Button>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-5">
          <RunMonitor
            run={activeRun}
            progress={stream.progress}
            logs={stream.logs}
            connected={stream.connected}
            onStop={() => void stop()}
            stopping={stopping}
            actions={
              activeRun && !isRunning ? (
                <Button size="sm" onClick={() => navigate(`results/${activeRun.id}`)} icon={<Table2 className="size-3.5" />}>
                  View results
                </Button>
              ) : null
            }
          />

          <Card>
            <CardHeader
              title="Recent runs"
              description="The last five runs."
              actions={
                <Button size="sm" variant="ghost" onClick={() => navigate("history")}>
                  View all
                </Button>
              }
            />
            {stats.loading ? (
              <LoadingState className="py-8" />
            ) : !stats.data?.recentRuns?.length ? (
              <EmptyState title="Nothing has run yet" description="Start a scraper to see it here." className="py-8" />
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {stats.data.recentRuns.map((run) => (
                  <li key={run.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`results/${run.id}`)}
                      className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{run.scraperName}</p>
                        <p className="truncate font-mono text-xs text-slate-500 dark:text-slate-400">{run.url}</p>
                      </div>
                      <span className="shrink-0 text-xs tabular-nums text-slate-500 dark:text-slate-400">
                        {run.totalItems.toLocaleString()} items
                      </span>
                      <StatusBadge status={run.status} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-2">
      <dt className="w-24 shrink-0 text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className={`min-w-0 flex-1 truncate text-slate-700 dark:text-slate-300 ${mono ? "font-mono" : ""}`} title={value}>
        {value}
      </dd>
    </div>
  );
}
