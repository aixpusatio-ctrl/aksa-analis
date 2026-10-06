import { useCallback, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileJson,
  FileSpreadsheet,
  FileText,
  History as HistoryIcon,
  MoreVertical,
  Play,
  Search,
  Table2,
  Trash2,
} from "lucide-react";
import type { ExportFormat, Run, RunStatus } from "@shared/types.ts";
import { api, ApiError, downloadExport } from "../services/api.ts";
import { useAsync } from "../hooks/useAsync.ts";
import { useToast } from "../hooks/useToast.tsx";
import { Button } from "../components/ui/Button.tsx";
import { Card } from "../components/ui/Card.tsx";
import { Badge, StatusBadge } from "../components/ui/Badge.tsx";
import { Dropdown, DropdownItem, DropdownLabel, DropdownSeparator } from "../components/ui/Dropdown.tsx";
import { ConfirmModal, Modal } from "../components/ui/Modal.tsx";
import { EmptyState, ErrorState, LoadingState } from "../components/ui/States.tsx";
import { Input, Select } from "../components/ui/Field.tsx";

const STATUS_OPTIONS: { value: RunStatus | "all"; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "completed", label: "Completed" },
  { value: "running", label: "Running" },
  { value: "stopped", label: "Stopped" },
  { value: "failed", label: "Failed" },
  { value: "queued", label: "Queued" },
];

const EXPORTS: { format: ExportFormat; label: string; icon: React.ReactNode }[] = [
  { format: "csv", label: "CSV", icon: <FileText className="size-4" /> },
  { format: "json", label: "JSON", icon: <FileJson className="size-4" /> },
  { format: "xlsx", label: "Excel", icon: <FileSpreadsheet className="size-4" /> },
];

const duration = (run: Run): string => {
  if (!run.startedAt) return "—";
  const end = run.finishedAt ? new Date(run.finishedAt).getTime() : Date.now();
  const seconds = Math.max(0, Math.round((end - new Date(run.startedAt).getTime()) / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
};

export function HistoryPage({ navigate }: { navigate: (to: string) => void }) {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<RunStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [pendingDelete, setPendingDelete] = useState<Run | null>(null);
  const [detail, setDetail] = useState<Run | null>(null);
  const [busy, setBusy] = useState(false);

  const pageSize = 20;
  const history = useAsync(() => api.history({ page, pageSize, status, search }), [page, status, search]);

  const rerun = useCallback(
    async (run: Run) => {
      if (!run.scraperId) {
        toast.warning("This scraper no longer exists", "Re-running needs the original configuration.");
        return;
      }
      try {
        const started = await api.startScraper(run.scraperId);
        toast.success("Scraping started", run.scraperName);
        navigate(`results/${started.run.id}`);
      } catch (error) {
        toast.error("Could not start the run", error instanceof ApiError ? error.message : String(error));
      }
    },
    [toast, navigate],
  );

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    setBusy(true);
    try {
      await api.deleteRun(pendingDelete.id);
      toast.success("Run deleted", "Its results were removed too.");
      setPendingDelete(null);
      history.reload();
    } catch (error) {
      toast.error("Could not delete the run", error instanceof ApiError ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [pendingDelete, toast, history]);

  if (history.loading && !history.data) return <LoadingState label="Loading history…" />;
  if (history.error) return <ErrorState message={history.error} onRetry={history.reload} />;

  const runs = history.data?.items ?? [];
  const total = history.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search by name or URL…"
            className="pl-9"
            aria-label="Search history"
          />
        </div>
        <Select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as RunStatus | "all");
            setPage(1);
          }}
          options={STATUS_OPTIONS}
          className="w-auto"
          aria-label="Filter by status"
        />
        <span className="text-xs text-slate-500 dark:text-slate-400">{total.toLocaleString()} run(s)</span>
      </div>

      {runs.length === 0 ? (
        <Card>
          <EmptyState
            icon={<HistoryIcon className="size-6" />}
            title={search || status !== "all" ? "No runs match your filters" : "No runs yet"}
            description={
              search || status !== "all"
                ? "Try a different search or status."
                : "Every scrape you start is recorded here with its results."
            }
            action={
              search || status !== "all" ? (
                <Button
                  size="sm"
                  onClick={() => {
                    setSearch("");
                    setStatus("all");
                  }}
                >
                  Clear filters
                </Button>
              ) : (
                <Button variant="primary" size="sm" onClick={() => navigate("dashboard")}>
                  Start a scrape
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-950/40">
                <tr className="text-left text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <th className="px-4 py-2.5">Scraper</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5 text-right">Items</th>
                  <th className="px-4 py-2.5 text-right">Pages</th>
                  <th className="px-4 py-2.5">Started</th>
                  <th className="px-4 py-2.5">Duration</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {runs.map((run) => (
                  <tr key={run.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="max-w-xs px-4 py-3">
                      <button
                        type="button"
                        onClick={() => navigate(`results/${run.id}`)}
                        className="block w-full min-w-0 text-left"
                      >
                        <span className="block truncate font-medium text-slate-900 dark:text-slate-100">
                          {run.scraperName}
                        </span>
                        <span className="block truncate font-mono text-xs text-slate-500 dark:text-slate-400">
                          {run.url}
                        </span>
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={run.status} />
                      {run.mode === "test" ? (
                        <Badge tone="brand" className="ml-1.5">
                          test
                        </Badge>
                      ) : null}
                      {run.errorMessage ? (
                        <p className="mt-1 max-w-[16rem] truncate text-xs text-rose-600 dark:text-rose-400" title={run.errorMessage}>
                          {run.errorMessage}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-300">
                      {run.totalItems.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-300">
                      {run.pagesProcessed}
                      {run.pagesPlanned ? <span className="text-slate-400"> / {run.pagesPlanned}</span> : null}
                    </td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap text-slate-500 dark:text-slate-400">
                      {new Date(run.startedAt ?? run.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-xs tabular-nums whitespace-nowrap text-slate-500 dark:text-slate-400">
                      {duration(run)}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => navigate(`results/${run.id}`)}
                          aria-label="Open results"
                        >
                          <Table2 className="size-4" />
                        </Button>
                        <Dropdown
                          trigger={({ toggle }) => (
                            <Button variant="ghost" size="icon" onClick={toggle} aria-label={`Actions for ${run.scraperName}`}>
                              <MoreVertical className="size-4" />
                            </Button>
                          )}
                        >
                          <DropdownItem icon={<Table2 className="size-4" />} onClick={() => navigate(`results/${run.id}`)}>
                            View results
                          </DropdownItem>
                          <DropdownItem icon={<Play className="size-4" />} onClick={() => void rerun(run)} disabled={!run.scraperId}>
                            Run again
                          </DropdownItem>
                          <DropdownItem icon={<Download className="size-4" />} onClick={() => setDetail(run)}>
                            Run details
                          </DropdownItem>
                          <DropdownSeparator />
                          <DropdownLabel>Export</DropdownLabel>
                          {EXPORTS.map((entry) => (
                            <DropdownItem
                              key={entry.format}
                              icon={entry.icon}
                              disabled={run.totalItems === 0}
                              onClick={() => downloadExport(run.id, entry.format)}
                            >
                              {entry.label}
                            </DropdownItem>
                          ))}
                          <DropdownSeparator />
                          <DropdownItem icon={<Trash2 className="size-4" />} destructive onClick={() => setPendingDelete(run)}>
                            Delete run
                          </DropdownItem>
                        </Dropdown>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 dark:border-slate-800">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Page {page} of {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <Button size="icon" variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page">
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
                aria-label="Next page"
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </Card>
      )}

      <ConfirmModal
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => void confirmDelete()}
        title="Delete this run?"
        message={
          <>
            The run from <strong>{pendingDelete ? new Date(pendingDelete.createdAt).toLocaleString() : ""}</strong> and
            its {pendingDelete?.totalItems.toLocaleString()} result row(s) will be deleted permanently.
          </>
        }
        confirmLabel="Delete run"
        destructive
        loading={busy}
      />

      <RunDetailModal run={detail} onClose={() => setDetail(null)} />
    </div>
  );
}

function RunDetailModal({ run, onClose }: { run: Run | null; onClose: () => void }) {
  return (
    <Modal open={run !== null} onClose={onClose} title="Run details" description={run?.scraperName} size="lg">
      {run ? (
        <div className="space-y-4">
          <dl className="grid gap-x-4 gap-y-2.5 sm:grid-cols-2">
            <Entry label="Run ID" value={run.id} mono />
            <Entry label="Status" value={run.status} />
            <Entry label="Target URL" value={run.url} mono />
            <Entry label="Items" value={run.totalItems.toLocaleString()} />
            <Entry label="Pages processed" value={String(run.pagesProcessed)} />
            <Entry label="Duration" value={duration(run)} />
            <Entry label="Started" value={run.startedAt ? new Date(run.startedAt).toLocaleString() : "—"} />
            <Entry label="Finished" value={run.finishedAt ? new Date(run.finishedAt).toLocaleString() : "—"} />
          </dl>

          {run.errorMessage ? (
            <div className="rounded-lg bg-rose-50 px-3 py-2.5 dark:bg-rose-500/10">
              <p className="text-xs font-semibold text-rose-700 dark:text-rose-300">Error</p>
              <p className="mt-1 text-xs break-words text-rose-600 dark:text-rose-400">{run.errorMessage}</p>
            </div>
          ) : null}

          <details className="rounded-lg border border-slate-200 dark:border-slate-800" open>
            <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300">
              Configuration used for this run
            </summary>
            <pre className="max-h-72 overflow-auto border-t border-slate-200 px-3 py-2 font-mono text-xs text-slate-600 dark:border-slate-800 dark:text-slate-300">
              {JSON.stringify(run.config, null, 2)}
            </pre>
          </details>
        </div>
      ) : null}
    </Modal>
  );
}

function Entry({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
      <dd
        className={`mt-0.5 truncate text-sm capitalize text-slate-800 dark:text-slate-200 ${mono ? "font-mono text-xs normal-case" : ""}`}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}
