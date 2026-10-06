import { useState } from "react";
import { Bug, Code2, FileWarning, Image as ImageIcon, Terminal } from "lucide-react";
import type { RunArtifact, SelectorReport } from "@shared/types.ts";
import { API_BASE, api } from "../services/api.ts";
import { useAsync } from "../hooks/useAsync.ts";
import { Card, CardBody, CardHeader } from "./ui/Card.tsx";
import { Button } from "./ui/Button.tsx";
import { Badge } from "./ui/Badge.tsx";
import { Modal } from "./ui/Modal.tsx";
import { EmptyState, LoadingState } from "./ui/States.tsx";
import { cx } from "../services/cx.ts";

const ICONS = {
  screenshot: <ImageIcon className="size-4" />,
  html: <Code2 className="size-4" />,
  console: <Terminal className="size-4" />,
  network: <FileWarning className="size-4" />,
  "selector-report": <Bug className="size-4" />,
} as const;

const LABELS = {
  screenshot: "Screenshot",
  html: "HTML snapshot",
  console: "Console log",
  network: "Network errors",
  "selector-report": "Selector report",
} as const;

const formatSize = (bytes: number): string =>
  bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} kB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/**
 * What the run captured when something went wrong: the page as the browser saw
 * it, and the per-field match counts that usually explain the failure outright.
 */
export function DebugPanel({ runId }: { runId: string }) {
  const artifacts = useAsync<RunArtifact[]>(() => api.runArtifacts(runId), [runId]);
  const [viewing, setViewing] = useState<RunArtifact | null>(null);

  const report = artifacts.data?.find((artifact) => artifact.kind === "selector-report");

  if (artifacts.loading) return null;
  if (artifacts.error) return null;
  if (!artifacts.data || artifacts.data.length === 0) return null;

  return (
    <Card>
      <CardHeader
        icon={<Bug className="size-4.5" />}
        title="Debug"
        description="Captured automatically so a failure can be understood without re-running it"
        actions={<Badge tone="neutral">{artifacts.data.length} item(s)</Badge>}
      />
      <CardBody className="space-y-4">
        {report ? <SelectorReportTable artifact={report} /> : null}

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {artifacts.data.map((artifact) => (
            <button
              key={artifact.id}
              type="button"
              onClick={() => setViewing(artifact)}
              className="flex items-start gap-2.5 rounded-xl border border-slate-200 p-3 text-left transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40"
            >
              <span className="mt-0.5 shrink-0 text-slate-400 dark:text-slate-500">{ICONS[artifact.kind]}</span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">{LABELS[artifact.kind]}</p>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                  {artifact.label || "—"} · {formatSize(artifact.size)}
                </p>
              </div>
            </button>
          ))}
        </div>
      </CardBody>

      <ArtifactModal artifact={viewing} onClose={() => setViewing(null)} />
    </Card>
  );
}

/** "Expected 10, found 0" — per field, from the page the run actually loaded. */
function SelectorReportTable({ artifact }: { artifact: RunArtifact }) {
  const report = useAsync<SelectorReport>(() => api.artifactJson<SelectorReport>(artifact.url), [artifact.id]);

  if (report.loading) return <LoadingState label="Loading the selector report…" className="py-6" />;
  if (report.error || !report.data) return null;

  const { itemSelector, itemsFound, fields } = report.data;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 px-3 py-2 dark:bg-slate-950/40">
        <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
          Item selector <code className="font-mono">{itemSelector || "(whole page)"}</code>
        </p>
        <Badge tone={itemsFound > 0 ? "success" : "danger"}>
          {itemsFound} item{itemsFound === 1 ? "" : "s"} found
        </Badge>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs font-semibold text-slate-500 dark:text-slate-400">
            <th className="px-3 py-2">Field</th>
            <th className="px-3 py-2">Selector</th>
            <th className="px-3 py-2 text-right">Found</th>
            <th className="px-3 py-2">Sample</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {fields.map((field) => {
            const missing = field.found === 0;
            const partial = field.found > 0 && field.found < itemsFound;
            return (
              <tr key={field.name} className={cx(missing && "bg-rose-50/60 dark:bg-rose-500/5")}>
                <td className="px-3 py-2 font-mono text-xs font-medium text-slate-800 dark:text-slate-200">{field.name}</td>
                <td className="max-w-[14rem] truncate px-3 py-2 font-mono text-xs text-slate-500 dark:text-slate-400">
                  {field.selector || "(the item itself)"}
                </td>
                <td className="px-3 py-2 text-right">
                  <span
                    className={cx(
                      "text-xs font-medium tabular-nums",
                      missing
                        ? "text-rose-600 dark:text-rose-400"
                        : partial
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-emerald-600 dark:text-emerald-400",
                    )}
                  >
                    {field.found} / {itemsFound}
                  </span>
                </td>
                <td className="max-w-[16rem] truncate px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
                  {field.sample ?? <span className="italic">nothing matched</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ArtifactModal({ artifact, onClose }: { artifact: RunArtifact | null; onClose: () => void }) {
  const text = useAsync<string | null>(
    () =>
      artifact && artifact.kind !== "screenshot"
        ? api.artifactText(artifact.url)
        : Promise.resolve(null),
    [artifact?.id],
  );

  return (
    <Modal
      open={artifact !== null}
      onClose={onClose}
      title={artifact ? LABELS[artifact.kind] : ""}
      description={artifact?.pageUrl}
      size="xl"
      footer={
        artifact ? (
          <>
            <a href={`${API_BASE}${artifact.url}`} target="_blank" rel="noreferrer noopener">
              <Button>Open in a new tab</Button>
            </a>
            <Button variant="primary" onClick={onClose}>
              Close
            </Button>
          </>
        ) : null
      }
    >
      {!artifact ? null : artifact.kind === "screenshot" ? (
        <img
          src={`${API_BASE}${artifact.url}`}
          alt="What the browser saw when the page failed"
          className="w-full rounded-lg border border-slate-200 dark:border-slate-800"
        />
      ) : text.loading ? (
        <LoadingState className="py-8" />
      ) : text.data ? (
        <pre className="max-h-[55vh] overflow-auto rounded-lg bg-slate-950 px-3 py-2.5 font-mono text-xs leading-relaxed text-slate-200">
          {artifact.kind === "selector-report" ? JSON.stringify(JSON.parse(text.data), null, 2) : text.data}
        </pre>
      ) : (
        <EmptyState title="Nothing to show" className="py-8" />
      )}
    </Modal>
  );
}
