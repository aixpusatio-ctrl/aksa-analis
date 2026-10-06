import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Download, FileJson, FileSpreadsheet, FileText, RefreshCw, Table2 } from "lucide-react";
import type { ExportFormat, Run } from "@shared/types.ts";
import { api, ApiError, downloadExport, type ResultsResponse } from "../services/api.ts";
import { useAsync } from "../hooks/useAsync.ts";
import { useRunStream } from "../hooks/useRunStream.ts";
import { useToast } from "../hooks/useToast.tsx";
import { Button } from "../components/ui/Button.tsx";
import { Card } from "../components/ui/Card.tsx";
import { Dropdown, DropdownItem, DropdownLabel } from "../components/ui/Dropdown.tsx";
import { EmptyState, ErrorState, LoadingState } from "../components/ui/States.tsx";
import { DataTable, cellToText } from "../components/DataTable.tsx";
import { RunMonitor } from "../components/RunMonitor.tsx";
import { DebugPanel } from "../components/DebugPanel.tsx";
import { Select } from "../components/ui/Field.tsx";

const EXPORTS: { format: ExportFormat; label: string; icon: React.ReactNode }[] = [
  { format: "csv", label: "CSV (.csv)", icon: <FileText className="size-4" /> },
  { format: "json", label: "JSON (.json)", icon: <FileJson className="size-4" /> },
  { format: "xlsx", label: "Excel (.xlsx)", icon: <FileSpreadsheet className="size-4" /> },
];

/**
 * Results for one run. With no run id it offers a picker over recent runs, so
 * the sidebar entry is useful on its own.
 */
export function ResultsPage({ runId, navigate }: { runId?: string; navigate: (to: string) => void }) {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [search, setSearch] = useState("");
  const [stopping, setStopping] = useState(false);

  const stream = useRunStream(runId ?? null);
  const runQuery = useAsync(() => (runId ? api.getRun(runId) : Promise.resolve(null)), [runId]);

  const results = useAsync<ResultsResponse | null>(
    () => (runId ? api.runResults(runId, { page, pageSize, search }) : Promise.resolve(null)),
    // `itemsVersion` ticks on every realtime batch, which refreshes the table.
    [runId, page, pageSize, search, stream.itemsVersion],
  );

  useEffect(() => setPage(1), [runId, search, pageSize]);

  const run: Run | null = runQuery.data?.run ?? null;
  const status = stream.progress?.status ?? run?.status;
  const isRunning = status === "running" || status === "queued";

  const stop = useCallback(async () => {
    if (!runId) return;
    setStopping(true);
    try {
      await api.stopRun(runId);
      toast.warning("Stop requested");
    } catch (error) {
      toast.error("Could not stop the run", error instanceof ApiError ? error.message : String(error));
    } finally {
      setStopping(false);
    }
  }, [runId, toast]);

  const copyPage = useCallback(async () => {
    const rows = results.data?.items ?? [];
    const columns = results.data?.columns ?? [];
    if (rows.length === 0) return;

    // Tab-separated so it pastes straight into a spreadsheet.
    const text = [
      columns.join("\t"),
      ...rows.map((row) => columns.map((column) => cellToText(row.data?.[column]).replaceAll("\t", " ")).join("\t")),
    ].join("\n");

    try {
      await navigator.clipboard.writeText(text);
      toast.success(`Copied ${rows.length} row(s)`, "Paste into a spreadsheet");
    } catch {
      toast.error("Clipboard unavailable", "Your browser blocked the copy.");
    }
  }, [results.data, toast]);

  if (!runId) return <RunPicker navigate={navigate} />;
  if (runQuery.loading) return <LoadingState label="Loading run…" />;
  if (runQuery.error) return <ErrorState message={runQuery.error} onRetry={runQuery.reload} />;

  const hasResults = (results.data?.total ?? 0) > 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate("history")} icon={<ArrowLeft className="size-4" />}>
          Back to history
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" onClick={results.reload} icon={<RefreshCw className="size-3.5" />}>
            Refresh
          </Button>
          <Dropdown
            trigger={({ toggle }) => (
              <Button
                size="sm"
                variant="primary"
                onClick={toggle}
                disabled={!hasResults}
                icon={<Download className="size-3.5" />}
              >
                Export
              </Button>
            )}
          >
            <DropdownLabel>Download {(results.data?.total ?? 0).toLocaleString()} rows</DropdownLabel>
            {EXPORTS.map((entry) => (
              <DropdownItem
                key={entry.format}
                icon={entry.icon}
                onClick={() => {
                  downloadExport(runId, entry.format);
                  toast.info(`Preparing ${entry.format.toUpperCase()} download…`);
                }}
              >
                {entry.label}
              </DropdownItem>
            ))}
          </Dropdown>
        </div>
      </div>

      <RunMonitor
        run={run}
        progress={stream.progress}
        logs={stream.logs}
        connected={stream.connected}
        onStop={() => void stop()}
        stopping={stopping}
      />

      {!isRunning && runId ? <DebugPanel key={`${runId}-${stream.itemsVersion}`} runId={runId} /> : null}

      {results.error ? (
        <Card>
          <ErrorState message={results.error} onRetry={results.reload} />
        </Card>
      ) : (
        <DataTable
          rows={results.data?.items ?? []}
          columns={results.data?.columns ?? []}
          loading={results.loading && !results.data}
          total={results.data?.total ?? 0}
          page={page}
          pageSize={pageSize}
          search={search}
          onSearchChange={setSearch}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          onCopyAll={() => void copyPage()}
          emptyTitle={isRunning ? "Waiting for the first results…" : "This run produced no data"}
          emptyDescription={
            isRunning
              ? "Rows appear here as soon as the first page is scraped."
              : "Check the log above — the item selector may not match anything on the page."
          }
        />
      )}
    </div>
  );
}

/** Shown when the Results tab is opened without a specific run. */
function RunPicker({ navigate }: { navigate: (to: string) => void }) {
  const history = useAsync(() => api.history({ pageSize: 50 }), []);
  const [selected, setSelected] = useState("");

  useEffect(() => {
    const first = history.data?.items[0];
    if (first && !selected) setSelected(first.id);
  }, [history.data, selected]);

  if (history.loading) return <LoadingState label="Loading runs…" />;
  if (history.error) return <ErrorState message={history.error} onRetry={history.reload} />;

  const runs = history.data?.items ?? [];

  if (runs.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<Table2 className="size-6" />}
          title="No results yet"
          description="Run a scraper and its data will show up here."
          action={
            <Button variant="primary" onClick={() => navigate("dashboard")}>
              Go to dashboard
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <Card className="mx-auto max-w-lg">
      <div className="space-y-4 px-5 py-6">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Pick a run</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Every run keeps its own result set, so you can always come back to an older one.
          </p>
        </div>
        <Select
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
          options={runs.map((run) => ({
            value: run.id,
            label: `${run.scraperName} — ${run.totalItems} items — ${new Date(run.createdAt).toLocaleString()}`,
          }))}
          aria-label="Run"
        />
        <Button variant="primary" className="w-full" onClick={() => navigate(`results/${selected}`)} disabled={!selected}>
          Open results
        </Button>
      </div>
    </Card>
  );
}
