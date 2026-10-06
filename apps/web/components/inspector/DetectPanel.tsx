import { Check, Sparkles, X } from "lucide-react";
import type { DetectedSchema } from "@shared/types.ts";
import { Button } from "../ui/Button.tsx";
import { Badge } from "../ui/Badge.tsx";
import { Modal } from "../ui/Modal.tsx";

/**
 * The result of auto-detection, shown for approval before anything is applied.
 * Detection is a guess, so it is always Accept / Edit / Reject — never silent.
 */
export function DetectModal({
  open,
  schema,
  onClose,
  onAccept,
  onUseAlternative,
}: {
  open: boolean;
  schema: DetectedSchema | null;
  onClose: () => void;
  onAccept: (schema: DetectedSchema) => void;
  onUseAlternative: (selector: string) => void;
}) {
  const confident = (value: number): "success" | "warning" | "neutral" =>
    value >= 0.8 ? "success" : value >= 0.5 ? "warning" : "neutral";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Detected structure"
      description={schema ? `${schema.itemCount} repeating items found` : undefined}
      size="lg"
      footer={
        <>
          <Button onClick={onClose} icon={<X className="size-4" />}>
            Reject
          </Button>
          {schema ? (
            <Button variant="primary" onClick={() => onAccept(schema)} icon={<Check className="size-4" />}>
              Accept {schema.fields.length} field{schema.fields.length === 1 ? "" : "s"}
            </Button>
          ) : null}
        </>
      }
    >
      {!schema ? (
        <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
          No repeating structure was found on this page. Pick elements by hand instead — click anything in the preview.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg bg-slate-50 px-3 py-2.5 dark:bg-slate-950/40">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Item selector</p>
              <Badge tone={confident(schema.confidence)}>confidence {Math.round(schema.confidence * 100)}%</Badge>
            </div>
            <code className="mt-1 block font-mono text-sm break-all text-slate-800 dark:text-slate-200">
              {schema.itemSelector}
            </code>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
              Fields ({schema.fields.length}) — you can edit all of these after accepting
            </p>
            <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
              {schema.fields.map((field) => (
                <div key={field.name} className="grid gap-1 px-3 py-2 sm:grid-cols-[8rem_1fr_auto] sm:items-center sm:gap-3">
                  <code className="truncate font-mono text-xs font-semibold text-slate-800 dark:text-slate-200">
                    {field.name}
                  </code>
                  <div className="min-w-0">
                    <code className="block truncate font-mono text-xs text-slate-500 dark:text-slate-400">
                      {field.selector || "(the item itself)"}
                      {field.attribute ? ` → ${field.attribute}` : ""}
                    </code>
                    {field.samples[0] ? (
                      <p className="truncate text-xs text-slate-400 dark:text-slate-500">e.g. {field.samples[0]}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Badge tone="neutral">{field.type}</Badge>
                    <Badge tone={confident(field.confidence)}>{Math.round(field.confidence * 100)}%</Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {schema.alternatives.length > 0 ? (
            <div>
              <p className="mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                Other repeating structures on this page
              </p>
              <div className="flex flex-wrap gap-2">
                {schema.alternatives.map((alt) => (
                  <button
                    key={alt.selector}
                    type="button"
                    onClick={() => onUseAlternative(alt.selector)}
                    className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-left transition-colors hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                  >
                    <code className="font-mono text-xs text-slate-700 dark:text-slate-300">{alt.selector}</code>
                    <span className="ml-2 text-xs text-slate-400">{alt.count} items</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </Modal>
  );
}

export function DetectButton({ onDetect, loading }: { onDetect: () => void; loading: boolean }) {
  return (
    <Button onClick={onDetect} loading={loading} icon={<Sparkles className="size-4" />}>
      Auto detect
    </Button>
  );
}
