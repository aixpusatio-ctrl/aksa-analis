import { Activity, FileStack, Layers, Link2, Square, Timer } from "lucide-react";
import type { Run, RunProgress } from "@shared/types.ts";
import type { LogEntry } from "@shared/types.ts";
import { Button } from "./ui/Button.tsx";
import { Card, CardBody, CardHeader } from "./ui/Card.tsx";
import { ProgressBar } from "./ui/ProgressBar.tsx";
import { StatusBadge } from "./ui/Badge.tsx";
import { LogConsole } from "./LogConsole.tsx";
import { EmptyState } from "./ui/States.tsx";

const formatDuration = (from: string | null, to: string | null): string => {
  if (!from) return "—";
  const start = new Date(from).getTime();
  const end = to ? new Date(to).getTime() : Date.now();
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
};

/** Progress, counters and live log for one run. */
export function RunMonitor({
  run,
  progress,
  logs,
  connected,
  onStop,
  stopping = false,
  actions,
}: {
  run: Run | null;
  progress: RunProgress | null;
  logs: LogEntry[];
  connected: boolean;
  onStop?: () => void;
  stopping?: boolean;
  actions?: React.ReactNode;
}) {
  const status = progress?.status ?? run?.status ?? "queued";
  const isRunning = run !== null && (status === "running" || status === "queued");

  const tone = status === "failed" ? "danger" : status === "stopped" ? "warning" : status === "completed" ? "success" : "brand";

  // With no run selected there is nothing to report, so show a resting state
  // rather than an empty progress bar and a Stop button that does nothing.
  if (!run) {
    return (
      <Card>
        <CardHeader icon={<Activity className="size-4.5" />} title="No active run" />
        <CardBody>
          <EmptyState
            icon={<Activity className="size-6" />}
            title="Nothing is running"
            description="Start a scraper and its progress, counters and log will appear here."
            className="py-10"
          />
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        icon={<Activity className="size-4.5" />}
        title={run.scraperName}
        description={run.url}
        actions={
          <div className="flex items-center gap-2">
            {actions}
            {onStop && isRunning ? (
              <Button variant="danger" size="sm" onClick={onStop} loading={stopping} icon={<Square className="size-3.5" />}>
                Stop
              </Button>
            ) : null}
            <StatusBadge status={status} />
          </div>
        }
      />
      <CardBody className="space-y-4">
        <div>
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
              {progress?.currentUrl ? (
                <>
                  <Link2 className="mr-1 inline size-3 align-[-1px]" />
                  <span className="font-mono">{progress.currentUrl}</span>
                </>
              ) : isRunning ? (
                "Starting…"
              ) : status === "completed" ? (
                `Finished — ${(progress?.totalItems ?? run.totalItems).toLocaleString()} item(s) from ${progress?.pagesProcessed ?? run.pagesProcessed} page(s)`
              ) : (
                (progress?.errorMessage ?? run.errorMessage ?? `Run ${status}`)
              )}
            </p>
            <p className="shrink-0 text-xs font-medium tabular-nums text-slate-600 dark:text-slate-300">
              {progress?.percent !== null && progress?.percent !== undefined ? `${progress.percent}%` : "—"}
            </p>
          </div>
          <ProgressBar
            value={isRunning && progress?.percent === null ? null : (progress?.percent ?? 0)}
            tone={tone}
            label="Scraping progress"
          />
        </div>

        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric icon={<FileStack className="size-4" />} label="Items found" value={(progress?.totalItems ?? run.totalItems).toLocaleString()} />
          <Metric
            icon={<Layers className="size-4" />}
            label="Pages processed"
            value={
              progress?.pagesPlanned
                ? `${progress.pagesProcessed} / ${progress.pagesPlanned}`
                : String(progress?.pagesProcessed ?? run.pagesProcessed)
            }
          />
          <Metric
            icon={<Timer className="size-4" />}
            label="Duration"
            value={formatDuration(progress?.startedAt ?? run.startedAt, progress?.finishedAt ?? run.finishedAt)}
          />
          <Metric icon={<Activity className="size-4" />} label="Status" value={status} />
        </dl>

        {(progress?.errorMessage ?? run.errorMessage) && status === "failed" ? (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs break-words text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
            {progress?.errorMessage ?? run.errorMessage}
          </p>
        ) : null}

        <LogConsole logs={logs} connected={connected} />
      </CardBody>
    </Card>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2.5 dark:bg-slate-950/40">
      <dt className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
        <span className="text-slate-400 dark:text-slate-500">{icon}</span>
        {label}
      </dt>
      <dd className="mt-1 truncate text-sm font-semibold capitalize tabular-nums text-slate-900 dark:text-slate-100">
        {value}
      </dd>
    </div>
  );
}
